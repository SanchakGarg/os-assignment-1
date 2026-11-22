#include "json.hpp"

#include <cctype>
#include <cmath>
#include <cstdio>

namespace json {
namespace {

struct Reader {
    const std::string &s;
    size_t i = 0;

    void skip_space()
    {
        while (i < s.size() && std::isspace((unsigned char)s[i])) i++;
    }

    bool eat(char c)
    {
        skip_space();
        if (i < s.size() && s[i] == c) { i++; return true; }
        return false;
    }

    static void append_utf8(std::string &out, unsigned code)
    {
        if (code < 0x80) {
            out += (char)code;
        } else if (code < 0x800) {
            out += (char)(0xC0 | code >> 6);
            out += (char)(0x80 | (code & 0x3F));
        } else {
            out += (char)(0xE0 | code >> 12);
            out += (char)(0x80 | (code >> 6 & 0x3F));
            out += (char)(0x80 | (code & 0x3F));
        }
    }

    bool string(std::string &out)
    {
        if (!eat('"')) return false;
        out.clear();
        while (i < s.size()) {
            char c = s[i++];
            if (c == '"') return true;
            if (c != '\\') { out += c; continue; }
            if (i >= s.size()) return false;
            char e = s[i++];
            switch (e) {
            case 'n': out += '\n'; break;
            case 'r': out += '\r'; break;
            case 't': out += '\t'; break;
            case 'b': out += '\b'; break;
            case 'f': out += '\f'; break;
            case 'u': {
                if (i + 4 > s.size()) return false;
                unsigned code = 0;
                for (int k = 0; k < 4; k++) {
                    char h = s[i++];
                    code <<= 4;
                    if (h >= '0' && h <= '9') code |= h - '0';
                    else if (h >= 'a' && h <= 'f') code |= h - 'a' + 10;
                    else if (h >= 'A' && h <= 'F') code |= h - 'A' + 10;
                    else return false;
                }
                append_utf8(out, code);
                break;
            }
            default: out += e; break;   /* \" \\ \/ */
            }
        }
        return false;
    }

    /* Numbers, true, false and null are kept as their text. */
    bool scalar(std::string &out)
    {
        skip_space();
        size_t start = i;
        while (i < s.size() && (std::isalnum((unsigned char)s[i]) || s[i] == '-' ||
                                s[i] == '+' || s[i] == '.'))
            i++;
        out = s.substr(start, i - start);
        return !out.empty();
    }
};

}  // namespace

bool parse_flat_object(const std::string &text, Object &out, std::string &error)
{
    Reader r{text};
    out.clear();
    if (!r.eat('{')) { error = "message must be a JSON object"; return false; }
    if (r.eat('}')) return true;
    for (;;) {
        std::string key, value;
        if (!r.string(key)) { error = "expected a quoted field name"; return false; }
        if (!r.eat(':')) { error = "expected ':' after \"" + key + "\""; return false; }
        r.skip_space();
        bool ok = (r.i < text.size() && text[r.i] == '"') ? r.string(value) : r.scalar(value);
        if (!ok) { error = "bad value for \"" + key + "\""; return false; }
        out[key] = value;
        if (r.eat(',')) continue;
        if (r.eat('}')) break;
        error = "expected ',' or '}'";
        return false;
    }
    r.skip_space();
    if (r.i != text.size()) { error = "unexpected text after the object"; return false; }
    return true;
}

std::string quote(const std::string &s)
{
    std::string out = "\"";
    for (unsigned char c : s) {
        switch (c) {
        case '"':  out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (c < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof buf, "\\u%04x", c);
                out += buf;
            } else {
                out += (char)c;
            }
        }
    }
    return out + "\"";
}

std::string quote_or_null(const char *s)
{
    return s ? quote(s) : "null";
}

std::string number(double v)
{
    if (!std::isfinite(v)) return "null";
    char buf[64];
    std::snprintf(buf, sizeof buf, "%.6f", v);
    std::string out = buf;
    out.erase(out.find_last_not_of('0') + 1);
    if (out.back() == '.') out.pop_back();
    if (out == "-0") out = "0";
    return out;
}

}  // namespace json
