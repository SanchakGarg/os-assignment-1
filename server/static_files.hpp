#pragma once

#include <string>

/*
 * Serves the browser viewer (the files in ./web) on the same port as the
 * WebSocket, so `./restaurant_server` and http://127.0.0.1:PORT/ is all a demo
 * needs. Only plain file names under ./web are served; anything else is 404.
 */

/* Answers one plain HTTP GET request (already read, headers included). */
void serve_static(int fd, const std::string &request);

/* True if ./web/index.html exists, i.e. the server was started from the repo root. */
bool viewer_available();
