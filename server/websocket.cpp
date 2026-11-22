#include "websocket.hpp"

#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#include <cctype>
#include <cstdint>
#include <cstring>

#include "static_files.hpp"

namespace ws {
namespace {

const char *const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const size_t MAX_MESSAGE = 4 * 1024 * 1024;   /* orders files are tiny */

/* SHA-1, only for the handshake's Sec-WebSocket-Accept value. */
std::string sha1(const std::string &input)
{
    uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
    std::string msg = input;
    uint64_t bit_len = (uint64_t)input.size() * 8;
    msg += (char)0x80;
    while (msg.size() % 64 != 56) msg += (char)0;
    for (int i = 7; i >= 0; i--) msg += (char)(bit_len >> (i * 8));

    auto rotl = [](uint32_t x, int n) { return (x << n) | (x >> (32 - n)); };
    for (size_t chunk = 0; chunk < msg.size(); chunk += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++)
            w[i] = (uint32_t)(uint8_t)msg[chunk + 4 * i] << 24 |
                   (uint32_t)(uint8_t)msg[chunk + 4 * i + 1] << 16 |
                   (uint32_t)(uint8_t)msg[chunk + 4 * i + 2] << 8 |
                   (uint32_t)(uint8_t)msg[chunk + 4 * i + 3];
        for (int i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20)      { f = (b & c) | (~b & d);          k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d;                   k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else             { f = b ^ c ^ d;                   k = 0xCA62C1D6; }
            uint32_t temp = rotl(a, 5) + f + e + k + w[i];
            e = d; d = c; c = rotl(b, 30); b = a; a = temp;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
    }

    std::string digest;
    for (uint32_t v : h)
        for (int i = 3; i >= 0; i--) digest += (char)(v >> (i * 8));
    return digest;
}

std::string base64(const std::string &in)
{
    static const char *chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    size_t i = 0;
    for (; i + 2 < in.size(); i += 3) {
        uint32_t v = (uint8_t)in[i] << 16 | (uint8_t)in[i + 1] << 8 | (uint8_t)in[i + 2];
        out += chars[v >> 18 & 63]; out += chars[v >> 12 & 63];
        out += chars[v >> 6 & 63];  out += chars[v & 63];
    }
    if (i + 1 == in.size()) {
        uint32_t v = (uint8_t)in[i] << 16;
        out += chars[v >> 18 & 63]; out += chars[v >> 12 & 63]; out += "==";
    } else if (i + 2 == in.size()) {
        uint32_t v = (uint8_t)in[i] << 16 | (uint8_t)in[i + 1] << 8;
        out += chars[v >> 18 & 63]; out += chars[v >> 12 & 63];
        out += chars[v >> 6 & 63];  out += '=';
    }
    return out;
}

bool read_exact(int fd, void *buf, size_t len)
{
    char *p = static_cast<char *>(buf);
    while (len > 0) {
        ssize_t got = recv(fd, p, len, 0);
        if (got <= 0) return false;
        p += got;
        len -= (size_t)got;
    }
    return true;
}

bool send_frame(int fd, uint8_t opcode, const std::string &payload)
{
    std::string header;
    header += (char)(0x80 | opcode);                 /* FIN + opcode, never masked */
    size_t len = payload.size();
    if (len < 126) {
        header += (char)len;
    } else if (len <= 0xFFFF) {
        header += (char)126;
        header += (char)(len >> 8);
        header += (char)len;
    } else {
        header += (char)127;
        for (int i = 7; i >= 0; i--) header += (char)((uint64_t)len >> (i * 8));
    }
    header += payload;                               /* one write: no Nagle/delayed-ACK stall */
    return write_all(fd, header.data(), header.size());
}

std::string header_value(const std::string &request, const std::string &name)
{
    size_t pos = 0;
    while ((pos = request.find("\r\n", pos)) != std::string::npos) {
        pos += 2;
        size_t colon = request.find(':', pos);
        size_t end = request.find("\r\n", pos);
        if (colon == std::string::npos || end == std::string::npos || colon > end) continue;
        std::string key = request.substr(pos, colon - pos);
        if (key.size() != name.size()) continue;
        bool same = true;
        for (size_t i = 0; i < key.size(); i++)
            if (std::tolower((unsigned char)key[i]) != std::tolower((unsigned char)name[i])) same = false;
        if (!same) continue;
        size_t start = colon + 1;
        while (start < end && request[start] == ' ') start++;
        return request.substr(start, end - start);
    }
    return "";
}

void set_receive_timeout(int fd, int seconds)
{
    timeval tv = { seconds, 0 };
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
}

bool loopback_host(const std::string &host)
{
    for (const char *name : { "127.0.0.1", "localhost" }) {
        size_t len = std::strlen(name);
        if (host.compare(0, len, name) == 0 && (host.size() == len || host[len] == ':'))
            return true;
    }
    return false;
}

/* Pages opened from disk (Origin "null"), tools without an Origin, and the
 * viewer served by this server may connect; other websites may not. */
bool origin_allowed(const std::string &request)
{
    std::string origin = header_value(request, "Origin");
    if (origin.empty() || origin == "null") return true;
    std::string host = header_value(request, "Host");
    return loopback_host(host) && origin == "http://" + host;
}

}  // namespace

bool write_all(int fd, const void *buf, size_t len)
{
    const char *p = static_cast<const char *>(buf);
    while (len > 0) {
#ifdef MSG_NOSIGNAL
        ssize_t sent = send(fd, p, len, MSG_NOSIGNAL);
#else
        ssize_t sent = send(fd, p, len, 0);   /* SIGPIPE ignored in main() */
#endif
        if (sent <= 0) return false;
        p += sent;
        len -= (size_t)sent;
    }
    return true;
}

bool handshake(int fd)
{
    std::string request;
    char c;
    set_receive_timeout(fd, 10);             /* an idle connection must not hold a thread */
    while (request.size() < 8192 && request.find("\r\n\r\n") == std::string::npos) {
        if (recv(fd, &c, 1, 0) != 1) return false;
        request += c;
    }
    set_receive_timeout(fd, 0);

    if (request.compare(0, 4, "GET ") != 0) {
        std::string reply = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n"
                            "Connection: close\r\n\r\nThis is a WebSocket server.\n";
        write_all(fd, reply.data(), reply.size());
        return false;
    }
    std::string key = header_value(request, "Sec-WebSocket-Key");
    if (key.empty()) {                       /* a plain page request: the viewer */
        serve_static(fd, request);
        return false;
    }
    if (!origin_allowed(request)) {
        std::string reply = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n"
                            "Connection: close\r\n\r\nOrigin not allowed.\n";
        write_all(fd, reply.data(), reply.size());
        return false;
    }

    std::string reply = "HTTP/1.1 101 Switching Protocols\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        "Sec-WebSocket-Accept: " + base64(sha1(key + GUID)) + "\r\n\r\n";
    return write_all(fd, reply.data(), reply.size());
}

ReadResult read_message(int fd, std::string &out)
{
    out.clear();
    for (;;) {
        uint8_t head[2];
        if (!read_exact(fd, head, 2)) return ReadResult::Closed;
        bool fin = head[0] & 0x80;
        uint8_t opcode = head[0] & 0x0F;
        bool masked = head[1] & 0x80;
        uint64_t len = head[1] & 0x7F;

        if (len == 126) {
            uint8_t ext[2];
            if (!read_exact(fd, ext, 2)) return ReadResult::Closed;
            len = (uint64_t)ext[0] << 8 | ext[1];
        } else if (len == 127) {
            uint8_t ext[8];
            if (!read_exact(fd, ext, 8)) return ReadResult::Closed;
            len = 0;
            for (int i = 0; i < 8; i++) len = len << 8 | ext[i];
        }
        if (!masked || len > MAX_MESSAGE || out.size() + len > MAX_MESSAGE)
            return ReadResult::Closed;                 /* clients must mask */

        uint8_t mask[4];
        if (!read_exact(fd, mask, 4)) return ReadResult::Closed;
        std::string payload(len, '\0');
        if (len > 0 && !read_exact(fd, &payload[0], len)) return ReadResult::Closed;
        for (size_t i = 0; i < len; i++) payload[i] ^= (char)mask[i % 4];

        if (opcode == 0x8) return ReadResult::Closed;                  /* close */
        if (opcode == 0x9) { send_frame(fd, 0xA, payload); continue; }  /* ping */
        if (opcode == 0xA) continue;                                    /* pong */
        if (opcode == 0x1 || opcode == 0x0) {                           /* text / continuation */
            out += payload;
            if (fin) return ReadResult::Message;
            continue;
        }
        return ReadResult::Closed;                                      /* binary: unsupported */
    }
}

bool send_text(int fd, const std::string &text)
{
    return send_frame(fd, 0x1, text);
}

void send_close(int fd)
{
    send_frame(fd, 0x8, "");
}

}  // namespace ws
