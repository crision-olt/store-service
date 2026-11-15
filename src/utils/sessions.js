// Open server-sent-event streams per user, kept in memory (single instance).
const streams = new Map();
const HEARTBEAT_MS = 25_000;

const add = (userId, res) => {
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId).add(res);
  const timer = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  res.on('close', () => {
    clearInterval(timer);
    const open = streams.get(userId);
    open?.delete(res);
    if (open?.size === 0) streams.delete(userId);
  });
};

const closeUser = (userId) => {
  for (const res of [...(streams.get(userId) ?? [])]) {
    res.write('event: blocked\ndata: {}\n\n');
    res.end();
  }
};

module.exports = { add, closeUser };
