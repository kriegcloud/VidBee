"""Fixed control-pipe helper. All candidate-scratch path resolution stays contained."""
import base64
import json
import os
import stat
import sys

root, operation, relative = sys.argv[1:]
parts = relative.split('/')
if any(part in ('', '.', '..') for part in parts):
    raise ValueError('Invalid scratch-relative path')
fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
for part in parts[:-1]:
    next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
    os.close(fd)
    fd = next_fd
name = parts[-1]
if operation == 'mkdir':
    os.mkdir(name, dir_fd=fd)
elif operation == 'read' or operation == 'access':
    item = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    info = os.fstat(item)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Scratch input must be a singly linked regular file')
    if operation == 'read':
        with os.fdopen(item, 'rb') as stream:
            sys.stdout.write(base64.b64encode(stream.read()).decode())
    else:
        os.close(item)
elif operation == 'write':
    payload = json.load(sys.stdin)
    # Replace the directory entry, never truncate a candidate inode. Exclusive
    # creation refuses every pre-existing entry (regular, symlink, hardlink, FIFO).
    item = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, payload['mode'], dir_fd=fd)
    with os.fdopen(item, 'wb') as stream:
        stream.write(base64.b64decode(payload['data']))
else:
    raise ValueError('Unknown scratch operation')
os.close(fd)
