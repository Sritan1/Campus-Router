#pragma once

#include <map>
#include <string>
#include <vector>

namespace campus {

/// @brief A small json value.
///
/// Only what the engine needs to talk to the gateway. Not a general
/// purpose library, and deliberately not one, because the request and
/// reply shapes here are fixed and small.
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

  /// @brief Read a bool, or the fallback when this is not one.
  bool asBool(bool fallback = false) const;

  /// @brief Read a number, or the fallback when this is not one.
  double asNumber(double fallback = 0.0) const;

  /// @brief Read a whole number, or the fallback when this is not one.
  long long asInteger(long long fallback = 0) const;

  /// @brief Read a string, or the fallback when this is not one.
  std::string asString(const std::string &fallback = "") const;

  /// @brief Elements of an array. Empty when this is not an array.
  const std::vector<Json> &items() const;

  /// @brief Members of an object. Empty when this is not an object.
  const std::map<std::string, Json> &fields() const;

  /// @brief Look up a key. Gives a null value when it is not there.
  const Json &at(const std::string &key) const;
  bool has(const std::string &key) const;

  void push(Json value);
  void set(const std::string &key, Json value);

  /// @brief Render back to json text.
  std::string dump() const;

  /// @brief Parse json text.
  /// @param text the input
  /// @param out the parsed value, by reference
  /// @param error what went wrong, when this returns false
  /// @return true when the whole input parsed
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
