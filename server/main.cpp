/*
 * restaurant_server -- WebSocket backend for the web-based restaurant simulator.
 *
 *   ./restaurant_server [PORT]        (default 8080, listens on 127.0.0.1)
 *
 * Each browser connection gets its own thread running run_session(). The
 * same port serves the viewer page from ./web (http://127.0.0.1:PORT/).
 * The protocol is described in docs/server.md.
 */
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <thread>

#include "session.hpp"
#include "static_files.hpp"

int main(int argc, char **argv)
{
    int port = argc > 1 ? std::atoi(argv[1]) : 8080;
    if (argc > 2 || port <= 0 || port > 65535) {
        std::fprintf(stderr, "Usage: %s [PORT]\n", argv[0]);
        return 1;
    }
    std::signal(SIGPIPE, SIG_IGN);       /* a closed browser tab must not kill the server */

    int listener = socket(AF_INET, SOCK_STREAM, 0);
    if (listener < 0) {
        std::perror("socket");
        return 1;
    }
    int yes = 1;
    setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);

    sockaddr_in addr = {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(listener, (sockaddr *)&addr, sizeof addr) < 0 || listen(listener, 16) < 0) {
        std::perror("bind/listen");
        return 1;
    }
    std::printf("Restaurant server listening on ws://127.0.0.1:%d\n", port);
    if (viewer_available())
        std::printf("Viewer: http://127.0.0.1:%d/\n", port);
    else
        std::printf("Warning: ./web/index.html not found, so the viewer is not served. "
                    "Start the server from the repository root, or open web/index.html directly.\n");
    std::fflush(stdout);

    for (;;) {
        int client = accept(listener, nullptr, nullptr);
        if (client < 0) continue;
        std::thread(run_session, client).detach();
    }
}
