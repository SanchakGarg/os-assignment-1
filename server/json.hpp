#pragma once

#include <map>
#include <string>

/*
 * Just enough JSON for this server.
 *  - parse_flat_object: reads a client message such as
 *    {"type":"start","tick_ms":500,"orders":"..."} into a map of
 *    field -> text. Nested objects/arrays are rejected.
 *  - Json: builds output text; the caller places commas, Json handles escaping.
 */
namespace json {

using Object = std::map<std::string, std::string>;

/* Returns false (with a reason in error) if the text is not a flat JSON object. */
bool parse_flat_object(const std::string &text, Object &out, std::string &error);

/* "abc" with quotes, backslashes and control characters escaped. */
std::string quote(const std::string &s);

/* A quoted string, or null when s is nullptr. */
std::string quote_or_null(const char *s);

/* A finite number with up to 6 decimals, trailing zeros removed. */
std::string number(double v);

}  // namespace json
