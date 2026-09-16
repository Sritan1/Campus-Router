#pragma once

#include <map>
#include <string>
#include <vector>

namespace campus {

// just enough json to talk to the gateway, not a general library
class Json {
 public:
  enum class Kind { Null, Bool, Number, String, Array, Object };

  Json() = default;

  static Json array();
  static Json object();
  static Json of(bool value);
  static Json of(double value);
  static Json of(long long value);
  static Json of(int value) { return Json::of(static_cast<long long>(value)); }
  static Json of(const std::string &value);
  static Json of(const char *value) { return Json::of(std::string(value)); }

  Kind kind() const { return this->valueKind; }
  bool isNull() const { return this->valueKind == Kind::Null; }
  bool isArray() const { return this->valueKind == Kind::Array; }
  bool isObject() const { return this->valueKind == Kind::Object; }
  bool isNumber() const { return this->valueKind == Kind::Number; }
  bool isString() const { return this->valueKind == Kind::String; }

  // the wrong type gives the fallback, or an empty list, instead of failing
  bool asBool(bool fallback = false) const;

  double asNumber(double fallback = 0.0) const;

  long long asInteger(long long fallback = 0) const;

  std::string asString(const std::string &fallback = "") const;

  const std::vector<Json> &items() const;

  const std::map<std::string, Json> &fields() const;

  // null when the key is missing
  const Json &at(const std::string &key) const;
  bool has(const std::string &key) const;

  void push(Json value);
  void set(const std::string &key, Json value);

  std::string dump() const;

  // false means the text was not valid json, and error says why
  static bool parse(const std::string &text, Json &out, std::string &error);

 private:
  Kind valueKind = Kind::Null;
  bool boolean = false;
  double number = 0.0;
  std::string text;
  std::vector<Json> elements;
  std::map<std::string, Json> members;
};

}  // namespace campus
