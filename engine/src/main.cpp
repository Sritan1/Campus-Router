// http front for the engine. loopback only, the gateway is the only caller

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>

#include "campus/loader.hpp"
#include "campus/service.hpp"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
typedef int socklen_t;
#else
#include <arpa/inet.h>
#include <csignal>
#include <ctime>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
typedef int SOCKET;
static const SOCKET INVALID_SOCKET = -1;
#endif

// writing to a socket the caller closed raises SIGPIPE on linux and kills us.
// the gateway gives up after five seconds, so any slow request would do it
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

namespace {

// a request bigger than this is not one of ours
constexpr size_t MAX_REQUEST_BYTES = 1 << 20;

// one request at a time, so a silent caller must not hold the engine forever
constexpr int SOCKET_TIMEOUT_S = 15;

void closeSocket(SOCKET s) {
#ifdef _WIN32
  closesocket(s);
#else
  close(s);
#endif
}

// sleep without pulling in a threading library
void pauseMs(int ms) {
#ifdef _WIN32
  Sleep(static_cast<DWORD>(ms));
#else
  timespec how_long;
  how_long.tv_sec = ms / 1000;
  how_long.tv_nsec = static_cast<long>(ms % 1000) * 1000000L;
  nanosleep(&how_long, nullptr);
#endif
}

// send can write less than it was given, so loop until it is all out
void sendAll(SOCKET conn, const std::string &data) {
  size_t sent = 0;
  while (sent < data.size()) {
    const int wrote = static_cast<int>(
        send(conn, data.data() + sent, static_cast<int>(data.size() - sent),
             MSG_NOSIGNAL));
    if (wrote <= 0) {
      return;
    }
    sent += static_cast<size_t>(wrote);
  }
}

void setTimeouts(SOCKET conn) {
#ifdef _WIN32
  DWORD ms = SOCKET_TIMEOUT_S * 1000;
  setsockopt(conn, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char *>(&ms),
             sizeof(ms));
  setsockopt(conn, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char *>(&ms),
             sizeof(ms));
#else
  timeval tv{};
  tv.tv_sec = SOCKET_TIMEOUT_S;
  setsockopt(conn, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
  setsockopt(conn, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
#endif
}

std::string envOr(const char *key, const std::string &fallback) {
  const char *value = std::getenv(key);
  if (value == nullptr || value[0] == '\0') {
    return fallback;
  }
  return std::string(value);
}

bool startSockets() {
#ifdef _WIN32
  WSADATA data;
  return WSAStartup(MAKEWORD(2, 2), &data) == 0;
#else
  return true;
#endif
}

void stopSockets() {
#ifdef _WIN32
  WSACleanup();
#endif
}

std::string reasonFor(int status) {
  switch (status) {
    case 200: return "OK";
    case 400: return "Bad Request";
    case 404: return "Not Found";
    case 405: return "Method Not Allowed";
    case 413: return "Payload Too Large";
    default: return "Internal Server Error";
  }
}

std::string httpReply(int status, const std::string &body) {
  std::string head = "HTTP/1.1 " + std::to_string(status) + " " + reasonFor(status) + "\r\n";
  head += "Content-Type: application/json\r\n";
  head += "Content-Length: " + std::to_string(body.size()) + "\r\n";
  head += "Connection: close\r\n\r\n";
  return head + body;
}

// bare minimum, the only client is the gateway
bool parseRequest(const std::string &raw, std::string &method, std::string &path,
                  std::string &body) {
  const size_t firstBreak = raw.find("\r\n");
  if (firstBreak == std::string::npos) {
    return false;
  }

  const std::string line = raw.substr(0, firstBreak);
  const size_t firstSpace = line.find(' ');
  const size_t secondSpace = line.find(' ', firstSpace + 1);
  if (firstSpace == std::string::npos || secondSpace == std::string::npos) {
    return false;
  }

  method = line.substr(0, firstSpace);
  path = line.substr(firstSpace + 1, secondSpace - firstSpace - 1);

  // no endpoint takes a query string
  const size_t question = path.find('?');
  if (question != std::string::npos) {
    path = path.substr(0, question);
  }

  const size_t headerEnd = raw.find("\r\n\r\n");
  body = headerEnd == std::string::npos ? "" : raw.substr(headerEnd + 4);
  return true;
}

// a big post arrives in pieces, so read until the body matches content length
bool readRequest(SOCKET conn, std::string &raw) {
  char buffer[8192];
  size_t expectedBody = 0;
  bool haveHeaders = false;

  for (;;) {
    const int got = recv(conn, buffer, sizeof(buffer), 0);
    if (got <= 0) {
      return !raw.empty();
    }
    raw.append(buffer, static_cast<size_t>(got));

    if (raw.size() > MAX_REQUEST_BYTES) {
      return false;
    }

    if (!haveHeaders) {
      const size_t headerEnd = raw.find("\r\n\r\n");
      if (headerEnd == std::string::npos) {
        continue;
      }
      haveHeaders = true;

      // header names are case insensitive
      std::string headers = raw.substr(0, headerEnd);
      for (char &c : headers) {
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      }
      const size_t at = headers.find("content-length:");
      if (at != std::string::npos) {
        expectedBody = static_cast<size_t>(std::atoll(headers.c_str() + at + 15));
      }
    }

    const size_t headerEnd = raw.find("\r\n\r\n");
    if (headerEnd != std::string::npos &&
        raw.size() - headerEnd - 4 >= expectedBody) {
      return true;
    }
  }
}

}  // namespace

int main(int argc, char **argv) {
#ifndef _WIN32
  // belt and braces with MSG_NOSIGNAL
  std::signal(SIGPIPE, SIG_IGN);
#endif

  const std::string host = envOr("ENGINE_BIND_HOST", "127.0.0.1");
  const int port = std::atoi(envOr("ENGINE_PORT", "8081").c_str());

  std::string graphPath = envOr("GRAPH_PATH", "api/data/graph.campus");
  if (argc > 1) {
    graphPath = argv[1];
  }

  campus::Graph graph;
  std::string error;
  if (!campus::loadGraph(graphPath, graph, error)) {
    std::fprintf(stderr, "engine: could not load %s, %s\n", graphPath.c_str(),
                 error.c_str());
    return 1;
  }
  std::printf("engine: loaded %zu nodes and %zu edges\n", graph.numNodes(),
              graph.numEdges());

  const campus::Service service(graph);

  if (!startSockets()) {
    std::fprintf(stderr, "engine: could not start sockets\n");
    return 1;
  }

  SOCKET listener = socket(AF_INET, SOCK_STREAM, 0);
  if (listener == INVALID_SOCKET) {
    std::fprintf(stderr, "engine: could not open socket\n");
    stopSockets();
    return 1;
  }

  int reuse = 1;
  setsockopt(listener, SOL_SOCKET, SO_REUSEADDR,
             reinterpret_cast<const char *>(&reuse), sizeof(reuse));

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(static_cast<unsigned short>(port));
  if (inet_pton(AF_INET, host.c_str(), &address.sin_addr) != 1) {
    std::fprintf(stderr, "engine: bad bind host %s\n", host.c_str());
    closeSocket(listener);
    stopSockets();
    return 1;
  }

  if (bind(listener, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0 ||
      listen(listener, 32) != 0) {
    std::fprintf(stderr, "engine: could not bind %s:%d\n", host.c_str(), port);
    closeSocket(listener);
    stopSockets();
    return 1;
  }

  std::printf("engine: listening on %s:%d\n", host.c_str(), port);
  std::fflush(stdout);

  for (;;) {
    sockaddr_in peer{};
    socklen_t peerLength = sizeof(peer);
    SOCKET conn = accept(listener, reinterpret_cast<sockaddr *>(&peer), &peerLength);
    if (conn == INVALID_SOCKET) {
      // accept can keep failing, and retrying straight away spins a core
      pauseMs(20);
      continue;
    }

    setTimeouts(conn);

    std::string raw;
    if (!readRequest(conn, raw)) {
      sendAll(conn,
              httpReply(413, campus::errorBody("request was too large or incomplete")));
      closeSocket(conn);
      continue;
    }

    std::string method;
    std::string path;
    std::string body;
    campus::Reply result;

    // an exception in here used to end the whole process
    try {
      if (!parseRequest(raw, method, path, body)) {
        result = {400, campus::errorBody("could not read the request line")};
      } else {
        result = service.handle(method, path, body);
      }
    } catch (const std::exception &problem) {
      std::fprintf(stderr, "engine: request failed, %s\n", problem.what());
      result = {500, campus::errorBody("the engine could not answer that")};
    } catch (...) {
      std::fprintf(stderr, "engine: request failed for an unknown reason\n");
      result = {500, campus::errorBody("the engine could not answer that")};
    }

    sendAll(conn, httpReply(result.status, result.body));
    closeSocket(conn);
  }

  closeSocket(listener);
  stopSockets();
  return 0;
}
