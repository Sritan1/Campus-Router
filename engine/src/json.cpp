#include "campus/json.hpp"

#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace campus {

namespace {

const Json NULL_VALUE;
const std::vector<Json> NO_ELEMENTS;
const std::map<std::string, Json> NO_MEMBERS;

// arrays and objects read each other, so a document of nothing but open
// brackets recurses once per bracket and runs the stack out. a megabyte
// of them is plenty to crash on, so cap the nesting well below that.
constexpr int MAX_DEPTH = 200;

/// @brief Walks the input text and builds values out of it.
class Reader {
 public:
  Reader(const std::string &source) : source(source) {}

  bool readValue(Json &out);
  bool atEndAfterSpace();
  const std::string &whatWentWrong() const { return this->error; }

 private:
  const std::string &source;
  size_t at = 0;
  int depth = 0;
  std::string error;

  void skipSpace();
  bool fail(const std::string &why);
  bool readString(std::string &out);
  bool readNumber(Json &out);
  bool readLiteral(const std::string &word);
  bool readArray(Json &out);
  bool readObject(Json &out);
};

void Reader::skipSpace() {
  while (this->at < this->source.size()) {
    const char c = this->source[this->at];
    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
      this->at++;
    } else {
      break;
    }
  }
}

bool Reader::fail(const std::string &why) {
  if (this->error.empty()) {
    this->error = why + " at position " + std::to_string(this->at);
  }
  return false;
}

bool Reader::atEndAfterSpace() {
  this->skipSpace();
  if (this->at != this->source.size()) {
    return this->fail("trailing characters");
  }
  return true;
}

bool Reader::readString(std::string &out) {
  if (this->at >= this->source.size() || this->source[this->at] != '"') {
    return this->fail("expected a string");
  }
  this->at++;

  out.clear();
  while (this->at < this->source.size()) {
    const char c = this->source[this->at++];
    if (c == '"') {
      return true;
    }
    if (c != '\\') {
      out.push_back(c);
      continue;
    }

    if (this->at >= this->source.size()) {
      return this->fail("string ends inside an escape");
    }
    const char escaped = this->source[this->at++];
    switch (escaped) {
      case '"': out.push_back('"'); break;
      case '\\': out.push_back('\\'); break;
      case '/': out.push_back('/'); break;
      case 'b': out.push_back('\b'); break;
      case 'f': out.push_back('\f'); break;
      case 'n': out.push_back('\n'); break;
      case 'r': out.push_back('\r'); break;
      case 't': out.push_back('\t'); break;
      case 'u': {
        // we do not need real unicode here, so keep the escape as written
        if (this->at + 4 > this->source.size()) {
          return this->fail("short unicode escape");
        }
        out += "\\u" + this->source.substr(this->at, 4);
        this->at += 4;
        break;
      }
      default:
        return this->fail("unknown escape");
    }
  }
  return this->fail("string never closes");
}

bool Reader::readNumber(Json &out) {
  const size_t began = this->at;

  // taking any run of digits, dots and signs let 1.2.3 and 5e5e5 through,
  // because strtod reads the front of it and stops without complaining.
  // this follows the actual shape a json number is allowed to have.
  auto digits = [&]() {
    const size_t from = this->at;
    while (this->at < this->source.size() && this->source[this->at] >= '0' &&
           this->source[this->at] <= '9') {
      this->at++;
    }
    return this->at > from;
  };

  if (this->at < this->source.size() && this->source[this->at] == '-') {
    this->at++;
  }
  if (!digits()) {
    return this->fail("expected a number");
  }

  if (this->at < this->source.size() && this->source[this->at] == '.') {
    this->at++;
    if (!digits()) {
      return this->fail("expected digits after the decimal point");
    }
  }

  if (this->at < this->source.size() &&
      (this->source[this->at] == 'e' || this->source[this->at] == 'E')) {
    this->at++;
    if (this->at < this->source.size() &&
        (this->source[this->at] == '+' || this->source[this->at] == '-')) {
      this->at++;
    }
    if (!digits()) {
      return this->fail("expected digits in the exponent");
    }
  }

  const std::string piece = this->source.substr(began, this->at - began);
  out = Json::of(std::strtod(piece.c_str(), nullptr));
  return true;
}

bool Reader::readLiteral(const std::string &word) {
  if (this->source.compare(this->at, word.size(), word) != 0) {
    return this->fail("expected " + word);
  }
  this->at += word.size();
  return true;
}

bool Reader::readArray(Json &out) {
  out = Json::array();
  this->at++;
  this->skipSpace();

  if (this->at < this->source.size() && this->source[this->at] == ']') {
    this->at++;
    return true;
  }

  for (;;) {
    Json element;
    if (!this->readValue(element)) {
      return false;
    }
    out.push(std::move(element));

    this->skipSpace();
    if (this->at >= this->source.size()) {
      return this->fail("array never closes");
    }
    if (this->source[this->at] == ',') {
      this->at++;
      continue;
    }
    if (this->source[this->at] == ']') {
      this->at++;
      return true;
    }
    return this->fail("expected a comma or a closing bracket");
  }
}

bool Reader::readObject(Json &out) {
  out = Json::object();
  this->at++;
  this->skipSpace();

  if (this->at < this->source.size() && this->source[this->at] == '}') {
    this->at++;
    return true;
  }

  for (;;) {
    this->skipSpace();
    std::string key;
    if (!this->readString(key)) {
      return false;
    }

    this->skipSpace();
    if (this->at >= this->source.size() || this->source[this->at] != ':') {
      return this->fail("expected a colon");
    }
    this->at++;

    Json value;
    if (!this->readValue(value)) {
      return false;
    }
    out.set(key, std::move(value));

    this->skipSpace();
    if (this->at >= this->source.size()) {
      return this->fail("object never closes");
    }
    if (this->source[this->at] == ',') {
      this->at++;
      continue;
    }
    if (this->source[this->at] == '}') {
      this->at++;
      return true;
    }
    return this->fail("expected a comma or a closing brace");
  }
}

bool Reader::readValue(Json &out) {
  this->skipSpace();
  if (this->at >= this->source.size()) {
    return this->fail("input ended early");
  }

  const char c = this->source[this->at];
  if (c == '{' || c == '[') {
    if (this->depth >= MAX_DEPTH) {
      return this->fail("nested too deeply");
    }
    this->depth++;
    const bool ok = c == '{' ? this->readObject(out) : this->readArray(out);
    this->depth--;
    return ok;
  }
  if (c == '"') {
    std::string value;
    if (!this->readString(value)) {
      return false;
    }
    out = Json::of(value);
    return true;
  }
  if (c == 't') {
    if (!this->readLiteral("true")) {
      return false;
    }
    out = Json::of(true);
    return true;
  }
  if (c == 'f') {
    if (!this->readLiteral("false")) {
      return false;
    }
    out = Json::of(false);
    return true;
  }
  if (c == 'n') {
    if (!this->readLiteral("null")) {
      return false;
    }
    out = Json();
    return true;
  }
  return this->readNumber(out);
}

void writeEscaped(const std::string &value, std::string &into) {
  into.push_back('"');
  for (char c : value) {
    switch (c) {
      case '"': into += "\\\""; break;
      case '\\': into += "\\\\"; break;
      case '\b': into += "\\b"; break;
      case '\f': into += "\\f"; break;
      case '\n': into += "\\n"; break;
      case '\r': into += "\\r"; break;
      case '\t': into += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buffer[8];
          std::snprintf(buffer, sizeof(buffer), "\\u%04x", c);
          into += buffer;
        } else {
          into.push_back(c);
        }
    }
  }
  into.push_back('"');
}

void writeNumber(double value, std::string &into) {
  char buffer[40];
  // whole numbers should not come out with a decimal point, ids especially
  if (std::isfinite(value) && value == std::floor(value) &&
      std::fabs(value) < 1e15) {
    std::snprintf(buffer, sizeof(buffer), "%lld", static_cast<long long>(value));
  } else if (!std::isfinite(value)) {
    into += "null";
    return;
  } else {
    // ten digits, because six rounds a latitude to about eleven metres
    // and the paths here are only seven metres apart
    std::snprintf(buffer, sizeof(buffer), "%.10g", value);
  }
  into += buffer;
}

void writeValue(const Json &value, std::string &into) {
  switch (value.kind()) {
    case Json::Kind::Null:
      into += "null";
      return;
    case Json::Kind::Bool:
      into += value.asBool() ? "true" : "false";
      return;
    case Json::Kind::Number:
      writeNumber(value.asNumber(), into);
      return;
    case Json::Kind::String:
      writeEscaped(value.asString(), into);
      return;
    case Json::Kind::Array: {
      into.push_back('[');
      bool first = true;
      for (const Json &element : value.items()) {
        if (!first) {
          into.push_back(',');
        }
        first = false;
        writeValue(element, into);
      }
      into.push_back(']');
      return;
    }
    case Json::Kind::Object: {
      into.push_back('{');
      bool first = true;
      for (const auto &entry : value.fields()) {
        if (!first) {
          into.push_back(',');
        }
        first = false;
        writeEscaped(entry.first, into);
        into.push_back(':');
        writeValue(entry.second, into);
      }
      into.push_back('}');
      return;
    }
  }
}

}  // namespace

Json Json::array() {
  Json value;
  value.valueKind = Kind::Array;
  return value;
}

Json Json::object() {
  Json value;
  value.valueKind = Kind::Object;
  return value;
}

Json Json::of(bool boolean) {
  Json value;
  value.valueKind = Kind::Bool;
  value.boolean = boolean;
  return value;
}

Json Json::of(double number) {
  Json value;
  value.valueKind = Kind::Number;
  value.number = number;
  return value;
}

Json Json::of(long long number) {
  return Json::of(static_cast<double>(number));
}

Json Json::of(const std::string &text) {
  Json value;
  value.valueKind = Kind::String;
  value.text = text;
  return value;
}

bool Json::asBool(bool fallback) const {
  return this->valueKind == Kind::Bool ? this->boolean : fallback;
}

double Json::asNumber(double fallback) const {
  return this->valueKind == Kind::Number ? this->number : fallback;
}

long long Json::asInteger(long long fallback) const {
  if (this->valueKind != Kind::Number) {
    return fallback;
  }
  return static_cast<long long>(this->number);
}

std::string Json::asString(const std::string &fallback) const {
  return this->valueKind == Kind::String ? this->text : fallback;
}

const std::vector<Json> &Json::items() const {
  return this->valueKind == Kind::Array ? this->elements : NO_ELEMENTS;
}

const std::map<std::string, Json> &Json::fields() const {
  return this->valueKind == Kind::Object ? this->members : NO_MEMBERS;
}

const Json &Json::at(const std::string &key) const {
  if (this->valueKind != Kind::Object) {
    return NULL_VALUE;
  }
  auto found = this->members.find(key);
  return found == this->members.end() ? NULL_VALUE : found->second;
}

bool Json::has(const std::string &key) const {
  return this->valueKind == Kind::Object && this->members.count(key) > 0;
}

void Json::push(Json value) {
  if (this->valueKind != Kind::Array) {
    this->valueKind = Kind::Array;
  }
  this->elements.push_back(std::move(value));
}

void Json::set(const std::string &key, Json value) {
  if (this->valueKind != Kind::Object) {
    this->valueKind = Kind::Object;
  }
  this->members[key] = std::move(value);
}

std::string Json::dump() const {
  std::string out;
  writeValue(*this, out);
  return out;
}

bool Json::parse(const std::string &text, Json &out, std::string &error) {
  Reader reader(text);
  if (!reader.readValue(out)) {
    error = reader.whatWentWrong();
    return false;
  }
  if (!reader.atEndAfterSpace()) {
    error = reader.whatWentWrong();
    return false;
  }
  return true;
}

}  // namespace campus
