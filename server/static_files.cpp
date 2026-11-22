#include "static_files.hpp"

#include <cctype>
#include <fstream>
#include <iterator>

#include "websocket.hpp"

namespace {

const std::string WEB_ROOT = "web";

const char *content_type(const std::string &path)
{
    static const struct { const char *ext, *type; } types[] = {
        { ".html", "text/html; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".js", "text/javascript; charset=utf-8" },
        { ".txt", "text/plain; charset=utf-8" },
        { ".svg", "image/svg+xml" },
        { ".png", "image/png" },
        { ".woff2", "font/woff2" },
    };
    for (const auto &t : types) {
        std::string ext = t.ext;
        if (path.size() > ext.size() && path.compare(path.size() - ext.size(), ext.size(), ext) == 0)
            return t.type;
    }
    return nullptr;
}

/* Letters, digits, '.', '_', '-' and '/' only; no "..", no empty segments. */
bool safe_path(const std::string &path)
{
    if (path.size() < 2 || path[0] != '/') return false;
    if (path.find("..") != std::string::npos || path.find("//") != std::string::npos) return false;
    for (unsigned char c : path)
        if (!std::isalnum(c) && c != '.' && c != '_' && c != '-' && c != '/') return false;
    return true;
}

void reply(int fd, const char *status, const char *type, const std::string &body)
{
    std::string head = std::string("HTTP/1.1 ") + status + "\r\nContent-Type: " + type +
                       "\r\nContent-Length: " + std::to_string(body.size()) +
                       "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
    ws::write_all(fd, head.data(), head.size());
    ws::write_all(fd, body.data(), body.size());
}

}  // namespace

void serve_static(int fd, const std::string &request)
{
    /* Request line: GET /path?query HTTP/1.1 */
    size_t start = request.find(' ');
    size_t end = start == std::string::npos ? start : request.find(' ', start + 1);
    if (end == std::string::npos) {
        reply(fd, "400 Bad Request", "text/plain", "Bad request.\n");
        return;
    }
    std::string path = request.substr(start + 1, end - start - 1);
    path = path.substr(0, path.find_first_of("?#"));
    if (path == "/") path = "/index.html";

    const char *type = content_type(path);
    std::ifstream file(WEB_ROOT + path, std::ios::binary);
    if (!safe_path(path) || !type || !file) {
        reply(fd, "404 Not Found", "text/plain",
              "Not found. The viewer is served from ./web; start restaurant_server from the "
              "repository root.\n");
        return;
    }
    std::string body((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    reply(fd, "200 OK", type, body);
}

bool viewer_available()
{
    return std::ifstream(WEB_ROOT + "/index.html").good();
}
