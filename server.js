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

// Root path redirects to the HTML file
app.get('/', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.join(__dirname, 'public', 'collaborative-drawing.html');
    
    // Check if file exists
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        // Send helpful error message
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Setup Required</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 800px; 
                        margin: 50px auto; 
                        padding: 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        background: white;
                        color: #333;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    }
                    h1 { color: #667eea; }
                    code {
                        background: #f4f4f4;
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: monospace;
                    }
                    .error { 
                        background: #fff3cd; 
                        border-left: 4px solid #ffc107;
                        padding: 15px;
                        margin: 20px 0;
                    }
                    .success {
                        background: #d4edda;
                        border-left: 4px solid #28a745;
                        padding: 15px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎨 Collaborative Drawing Server</h1>
                    <div class="error">
                        <strong>⚠️ HTML File Not Found</strong>
                        <p>The file <code>collaborative-drawing.html</code> is missing from the <code>public/</code> folder.</p>
                    </div>
                    
                    <h2>📂 Required File Structure:</h2>
                    <pre>
collaborative-drawing/
├── server.js
├── package.json
└── public/
    └── collaborative-drawing.html  ← Missing!
                    </pre>
                    
                    <h2>✅ How to Fix:</h2>
                    <ol>
                        <li>Create a folder named <code>public</code> in your project root</li>
                        <li>Place <code>collaborative-drawing.html</code> inside the <code>public</code> folder</li>
                        <li>Restart the server or redeploy</li>
                    </ol>
                    
                    <div class="success">
                        <strong>✓ Server is Running!</strong>
                        <p>The Node.js server is working correctly. Just add the HTML file to complete the setup.</p>
                    </div>
                    
                    <h2>🔍 Debug Info:</h2>
                    <ul>
                        <li><strong>Looking for file at:</strong> <code>${htmlPath}</code></li>
                        <li><strong>Current directory:</strong> <code>${__dirname}</code></li>
                        <li><strong>Server Status:</strong> Running ✓</li>
                        <li><strong>Socket.io:</strong> Ready ✓</li>
                    </ul>
                    
                    <p><strong>Need help?</strong> Check the README.md or RENDER-DEPLOYMENT.md files for detailed instructions.</p>
                </div>
            </body>
            </html>
        `);
    }
});

// Alternative routes
app.get('/draw', (req, res) => {
    res.redirect('/');
});

app.get('/collaborative-drawing.html', (req, res) => {
    res.redirect('/');
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Collaborative Drawing Server is running',
        rooms: rooms.size,
        timestamp: new Date().toISOString()
    });
});

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
