// round 0 spike. this only answers healthz.
// the real routing engine replaces this in round 2.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
typedef int socklen_t;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int SOCKET;
static const SOCKET INVALID_SOCKET = -1;
#endif

namespace {

void closeSocket(SOCKET s) {
#ifdef _WIN32
  closesocket(s);
#else
  close(s);
#endif
}

// reads an env var and falls back when it is missing or empty
std::string envOr(const char *key, const std::string &fallback) {
  const char *value = std::getenv(key);
  if (value == nullptr || value[0] == '\0') {
    return fallback;
  }
  return std::string(value);
}

bool startWinsock() {
#ifdef _WIN32
  WSADATA data;
  return WSAStartup(MAKEWORD(2, 2), &data) == 0;
#else
  return true;
#endif
}

void stopWinsock() {
#ifdef _WIN32
  WSACleanup();
#endif
}

std::string httpResponse(const std::string &body) {
  std::string head = "HTTP/1.1 200 OK\r\n";
  head += "Content-Type: application/json\r\n";
  head += "Content-Length: " + std::to_string(body.size()) + "\r\n";
  head += "Connection: close\r\n\r\n";
  return head + body;
}

}  // namespace

int main() {
  // default bind is loopback on purpose.
  // the engine sits behind the python gateway and is never public.
  const std::string host = envOr("ENGINE_BIND_HOST", "127.0.0.1");
  const int port = std::atoi(envOr("ENGINE_PORT", "8081").c_str());

  if (!startWinsock()) {
    std::fprintf(stderr, "engine: could not start winsock\n");
    return 1;
  }

  SOCKET listener = socket(AF_INET, SOCK_STREAM, 0);
  if (listener == INVALID_SOCKET) {
    std::fprintf(stderr, "engine: could not open socket\n");
    stopWinsock();
    return 1;
  }

  int reuse = 1;
  setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char *>(&reuse),
             sizeof(reuse));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<unsigned short>(port));
  if (inet_pton(AF_INET, host.c_str(), &addr.sin_addr) != 1) {
    std::fprintf(stderr, "engine: bad bind host %s\n", host.c_str());
    closeSocket(listener);
    stopWinsock();
    return 1;
  }

  if (bind(listener, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) != 0) {
    std::fprintf(stderr, "engine: could not bind %s:%d\n", host.c_str(), port);
    closeSocket(listener);
    stopWinsock();
    return 1;
  }

  if (listen(listener, 16) != 0) {
    std::fprintf(stderr, "engine: could not listen\n");
    closeSocket(listener);
    stopWinsock();
    return 1;
  }

  // the gateway waits for this line before it starts serving traffic
  std::printf("engine: listening on %s:%d\n", host.c_str(), port);
  std::fflush(stdout);

  const std::string body = "{\"ok\":true,\"service\":\"engine\",\"stage\":\"round0\"}";

  for (;;) {
    sockaddr_in peer{};
    socklen_t peerLen = sizeof(peer);
    SOCKET conn = accept(listener, reinterpret_cast<sockaddr *>(&peer), &peerLen);
    if (conn == INVALID_SOCKET) {
      continue;
    }

    // we drain one read only. the spike does not parse the request.
    char scratch[2048];
    recv(conn, scratch, sizeof(scratch), 0);

    const std::string response = httpResponse(body);
    send(conn, response.c_str(), static_cast<int>(response.size()), 0);
    closeSocket(conn);
  }

  closeSocket(listener);
  stopWinsock();
  return 0;
}
