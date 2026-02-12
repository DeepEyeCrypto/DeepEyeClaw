import WebSocket from 'ws';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;
const SECRET_KEY = 'your_secret_key';  // Replace with your actual secret key

// Security Headers Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

// Rate Limiting Middleware
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.'
});
app.use('/ws', limiter);

// Suspicious Activity Tracking & IP Banning
const bannedIPs = new Set();
const logSuspiciousActivity = (ip) => {
    console.log(`Suspicious activity detected from IP: ${ip}`);
    bannedIPs.add(ip);
};

const isBanned = (ip) => bannedIPs.has(ip);

// WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

// Token Validation Middleware
const authorize = (token) => {
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        return decoded;
    } catch (err) {
        return null;
    }
};

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
    const token = request.headers['sec-websocket-protocol']; // Expect token to be here
    const ip = request.socket.remoteAddress;

    if (isBanned(ip)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
    }

    const user = authorize(token);
    if (!user) {
        logSuspiciousActivity(ip);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, user);
    });
});

wss.on('connection', (ws, user) => {
    console.log(`User ${user.id} connected`);
    ws.on('message', (message) => {
        console.log(`Received message from user ${user.id}: ${message}`);
    });

    ws.on('close', () => {
        console.log(`User ${user.id} disconnected`);
    });
});

