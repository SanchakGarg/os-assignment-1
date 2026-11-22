#pragma once

#include <string>

/*
 * Minimal WebSocket server side (RFC 6455) over a connected TCP socket:
 * the HTTP upgrade handshake, then text messages in both directions.
 * Enough for a browser client; no extensions, no binary messages.
 */
namespace ws {

/* Reads the HTTP upgrade request and replies 101. Returns false if it was
 * not a valid WebSocket request (a 400 reply is sent). */
bool handshake(int fd);

enum class ReadResult { Message, Closed };

/* Blocks until one complete text message arrives (answers pings, joins
 * fragments). Returns Closed on close frame, disconnect or protocol error. */
ReadResult read_message(int fd, std::string &out);

/* Sends one text message. Returns false if the client has gone. */
bool send_text(int fd, const std::string &text);

void send_close(int fd);

}  // namespace ws
