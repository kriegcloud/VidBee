#!/usr/bin/env python3
"""Answer every DNS query with 127.0.0.1 / ::1 and log the queried name."""
import socket, struct, sys, time
log = open(sys.argv[1], "a", buffering=1)
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("127.0.0.1", 53))
log.write("# dns-logger ready\n")
while True:
    data, addr = s.recvfrom(2048)
    try:
        i, labels = 12, []
        while data[i]:
            n = data[i]; labels.append(data[i + 1:i + 1 + n].decode("ascii", "replace")); i += 1 + n
        qtype = struct.unpack("!H", data[i + 1:i + 3])[0]
        qend = i + 5
        name = ".".join(labels)
        log.write(f"{time.strftime('%H:%M:%S')} type={qtype} {name}\n")
        hdr = data[:2] + b"\x81\x80" + data[4:6]
        if qtype == 1:
            rr = b"\xc0\x0c\x00\x01\x00\x01\x00\x00\x00\x3c\x00\x04\x7f\x00\x00\x01"
            resp = hdr + b"\x00\x01\x00\x00\x00\x00" + data[12:qend] + rr
        else:
            resp = hdr + b"\x00\x00\x00\x00\x00\x00" + data[12:qend]
        s.sendto(resp, addr)
    except Exception as e:  # malformed packet: log and keep serving
        log.write(f"# error {e!r}\n")
