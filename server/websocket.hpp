#pragma once

#include <string>

/*
 * Minimal WebSocket server side (RFC 6455) over a connected TCP socket:
 * the HTTP upgrade handshake, then text messages in both directions.
 * Enough for a browser client; no extensions, no binary messages.
 */
namespace ws {

/* Reads the HTTP request. A WebSocket upgrade from an allowed origin gets 101
 * and returns true. Anything else returns false after a reply: a plain GET is
 * answered with a viewer file (static_files.hpp), a foreign origin with 403. */
bool handshake(int fd);

/* Writes all of buf. Returns false if the client has gone. */
bool write_all(int fd, const void *buf, size_t len);

enum class ReadResult { Message, Closed };

/* Blocks until one complete text message arrives (answers pings, joins
 * fragments). Returns Closed on close frame, disconnect or protocol error. */
ReadResult read_message(int fd, std::string &out);

/* Sends one text message. Returns false if the client has gone. */
bool send_text(int fd, const std::string &text);

void send_close(int fd);

}  // namespace ws
