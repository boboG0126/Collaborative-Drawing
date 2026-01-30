// server.js - Node.js backend for collaborative drawing
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store active rooms and their users
const rooms = new Map();

// Serve static files (your HTML file)
app.use(express.static('public'));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('create-room', (data) => {
        const { roomCode, canvasWidth, canvasHeight, userId, userColor } = data;
        
        // Create room if it doesn't exist
        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                users: new Map(),
                canvasSize: { width: canvasWidth, height: canvasHeight },
                drawingHistory: []
            });
            console.log(`Room created: ${roomCode}`);
        }

        // Join the room
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.userId = userId;

        // Add user to room
        const room = rooms.get(roomCode);
        room.users.set(socket.id, { userId, userColor, socketId: socket.id });

        // Send room info back to user
        socket.emit('room-joined', {
            success: true,
            roomCode,
            canvasSize: room.canvasSize,
            userCount: room.users.size,
            drawingHistory: room.drawingHistory
        });

        // Notify others in room
        socket.to(roomCode).emit('user-joined', {
            userId,
            userColor,
            userCount: room.users.size
        });

        console.log(`User ${userId} created/joined room ${roomCode}. Total users: ${room.users.size}`);
    });

    // Join existing room
    socket.on('join-room', (data) => {
        const { roomCode, userId, userColor } = data;

        // Check if room exists
        if (!rooms.has(roomCode)) {
            socket.emit('room-joined', {
                success: false,
                error: 'Room not found'
            });
            return;
        }

        // Join the room
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.userId = userId;

        const room = rooms.get(roomCode);
        room.users.set(socket.id, { userId, userColor, socketId: socket.id });

        // Send room info and drawing history to new user
        socket.emit('room-joined', {
            success: true,
            roomCode,
            canvasSize: room.canvasSize,
            userCount: room.users.size,
            drawingHistory: room.drawingHistory
        });

        // Notify others in room
        socket.to(roomCode).emit('user-joined', {
            userId,
            userColor,
            userCount: room.users.size
        });

        console.log(`User ${userId} joined room ${roomCode}. Total users: ${room.users.size}`);
    });

    // Handle drawing events
    socket.on('draw', (data) => {
        if (!socket.roomCode) return;

        const room = rooms.get(socket.roomCode);
        if (!room) return;

        // Add to drawing history (limit to last 1000 actions to prevent memory issues)
        room.drawingHistory.push(data);
        if (room.drawingHistory.length > 1000) {
            room.drawingHistory.shift();
        }

        // Broadcast to all other users in the room
        socket.to(socket.roomCode).emit('draw', data);
    });

    // Handle cursor movement
    socket.on('cursor-move', (data) => {
        if (!socket.roomCode) return;

        // Broadcast cursor position to all other users in the room
        socket.to(socket.roomCode).emit('cursor-move', {
            ...data,
            socketId: socket.id
        });
    });

    // Handle canvas clear
    socket.on('clear-canvas', () => {
        if (!socket.roomCode) return;

        const room = rooms.get(socket.roomCode);
        if (room) {
            room.drawingHistory = [];
        }

        // Broadcast to all users in the room
        io.to(socket.roomCode).emit('clear-canvas');
    });

    // Handle undo
    socket.on('undo', () => {
        if (!socket.roomCode) return;

        // Broadcast to all users in the room
        socket.to(socket.roomCode).emit('undo');
    });

    // Handle redo
    socket.on('redo', () => {
        if (!socket.roomCode) return;

        // Broadcast to all users in the room
        socket.to(socket.roomCode).emit('redo');
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        if (socket.roomCode && rooms.has(socket.roomCode)) {
            const room = rooms.get(socket.roomCode);
            room.users.delete(socket.id);

            // Notify others in room
            socket.to(socket.roomCode).emit('user-left', {
                userId: socket.userId,
                userCount: room.users.size
            });

            // Delete room if empty
            if (room.users.size === 0) {
                rooms.delete(socket.roomCode);
                console.log(`Room ${socket.roomCode} deleted (empty)`);
            } else {
                console.log(`Room ${socket.roomCode} now has ${room.users.size} users`);
            }
        }
    });
});

// Start server
http.listen(PORT, () => {
    console.log(`🎨 Collaborative Drawing Server running on port ${PORT}`);
    console.log(`📡 Socket.io server ready for connections`);
});
