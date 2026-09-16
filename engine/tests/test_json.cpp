#include "campus/json.hpp"
#include "harness.hpp"

using campus::Json;

namespace {

Json parsed(const std::string &text) {
  Json out;
  std::string error;
  CHECK(Json::parse(text, out, error));
  return out;
}

bool rejects(const std::string &text) {
  Json out;
  std::string error;
  return !Json::parse(text, out, error);
}

}  // namespace

TEST(readsTheSimpleTypes) {
  CHECK(parsed("null").isNull());
  CHECK(parsed("true").asBool() == true);
  CHECK(parsed("false").asBool() == false);
  CHECK_NEAR(parsed("42").asNumber(), 42.0, 1e-9);
  CHECK_NEAR(parsed("-1.5e2").asNumber(), -150.0, 1e-9);
  CHECK(parsed("\"hello\"").asString() == "hello");
}

TEST(readsNestedShapes) {
  Json value = parsed(R"({"a":[1,2,{"b":"c"}],"d":null})");
  CHECK(value.isObject());
  CHECK(value.at("a").items().size() == 3);
  CHECK(value.at("a").items()[2].at("b").asString() == "c");
  CHECK(value.at("d").isNull());
}

TEST(missingKeysComeBackNullRatherThanCrashing) {
  Json value = parsed(R"({"a":1})");
  CHECK(value.at("nope").isNull());
  CHECK(!value.has("nope"));
  // and reading the wrong type gives the fallback
  CHECK(value.at("a").asString("fallback") == "fallback");
  CHECK(value.at("nope").asNumber(7.0) == 7.0);
}

TEST(handlesWhitespaceEverywhere) {
  Json value = parsed("  {\n \"a\" : [ 1 , 2 ] \r\n }  ");
  CHECK(value.at("a").items().size() == 2);
}

TEST(handlesEmptyContainers) {
  CHECK(parsed("[]").items().empty());
  CHECK(parsed("{}").fields().empty());
  CHECK(parsed("[]").isArray());
  CHECK(parsed("{}").isObject());
}

TEST(readsStringEscapes) {
  CHECK(parsed(R"("a\"b")").asString() == "a\"b");
  CHECK(parsed(R"("line\nbreak")").asString() == "line\nbreak");
  CHECK(parsed(R"("back\\slash")").asString() == "back\\slash");
}

TEST(rejectsBrokenInput) {
  CHECK(rejects(""));
  CHECK(rejects("{"));
  CHECK(rejects("[1,2"));
  CHECK(rejects(R"({"a")"));
  CHECK(rejects(R"({"a":})"));
  CHECK(rejects("tru"));
  CHECK(rejects("\"unterminated"));
  CHECK(rejects("{} extra"));
  CHECK(rejects("1 2"));
}

TEST(writesWholeNumbersWithoutADecimalPoint) {
  // node ids must not come out in exponent form
  CHECK(Json::of(static_cast<long long>(151960667)).dump() == "151960667");
  CHECK(Json::of(static_cast<long long>(-151960667)).dump() == "-151960667");
  CHECK(Json::of(0).dump() == "0");
}

TEST(coordinatesKeepEnoughDigitsToBeUseful) {
  // six digits rounds a latitude to about eleven metres, paths are seven apart
  CHECK(Json::of(41.8708305).dump() == "41.8708305");
  CHECK(Json::of(-87.6504556).dump() == "-87.6504556");

  CHECK(Json::of(41.8708305).dump() != Json::of(41.8708405).dump());
}

TEST(writesTheOtherTypes) {
  CHECK(Json::of(true).dump() == "true");
  CHECK(Json().dump() == "null");
  CHECK(Json::of(std::string("hi")).dump() == "\"hi\"");
}

TEST(escapesOnTheWayOut) {
  CHECK(Json::of(std::string("a\"b")).dump() == R"("a\"b")");
  CHECK(Json::of(std::string("a\nb")).dump() == R"("a\nb")");
}

TEST(roundTripsThroughTextAndBack) {
  const std::string original =
      R"({"cost":{"blocked":["steps|unknown|none"],"default":1},"start":-151960667})";
  Json value = parsed(original);
  Json again = parsed(value.dump());

  CHECK(again.at("start").asInteger() == -151960667);
  CHECK(again.at("cost").at("blocked").items()[0].asString() == "steps|unknown|none");
  CHECK_NEAR(again.at("cost").at("default").asNumber(), 1.0, 1e-9);
}

TEST(buildsValuesFromScratch) {
  Json body = Json::object();
  body.set("ok", Json::of(true));

  Json list = Json::array();
  list.push(Json::of(1));
  list.push(Json::of(std::string("two")));
  body.set("items", std::move(list));

  Json back = parsed(body.dump());
  CHECK(back.at("ok").asBool());
  CHECK(back.at("items").items().size() == 2);
  CHECK(back.at("items").items()[1].asString() == "two");
}

TEST(deeplyNestedInputStillParses) {
  std::string text;
  for (int i = 0; i < 40; i++) {
    text += "[";
  }
  text += "1";
  for (int i = 0; i < 40; i++) {
    text += "]";
  }
  Json out;
  std::string error;
  CHECK(Json::parse(text, out, error));
}

TEST(absurdNestingIsRefusedRatherThanCrashing) {
  // this used to recurse once per bracket and crash the process
  std::string text;
  for (int i = 0; i < 100000; i++) {
    text += "[";
  }

  Json out;
  std::string error;
  CHECK(!Json::parse(text, out, error));
  CHECK(!error.empty());
}

TEST(absurdNestingIsWrittenOutRatherThanCrashing) {
  // the writer has to stop where the reader does
  Json deep = Json::of(1);
  for (int i = 0; i < 400; i++) {
    Json around = Json::array();
    around.push(std::move(deep));
    deep = std::move(around);
  }

  const std::string text = deep.dump();
  CHECK(!text.empty());
  CHECK(text.find("null") != std::string::npos);
  CHECK(text.find("1") == std::string::npos);
}

TEST(nestingWeActuallyUseStillParses) {
  // real requests are three or four deep, far below the cap
  std::string text;
  for (int i = 0; i < 60; i++) {
    text += "[";
  }
  text += "1";
  for (int i = 0; i < 60; i++) {
    text += "]";
  }

  Json out;
  std::string error;
  CHECK(Json::parse(text, out, error));
}
