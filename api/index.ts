// eisc-chat/api/index.ts

/**
 * Entry point for the chat server.
 * Initializes environment variables, configures Express, CORS, and Socket.IO,
 * and manages real-time chat and room interactions.
 */

import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// -------------------------------------------------------------
// Load environment variables early
// -------------------------------------------------------------

/**
 * Loads environment variables from `.env` so they can be used application-wide.
 */
dotenv.config();

// -------------------------------------------------------------
// Express + HTTP Server setup
// -------------------------------------------------------------

/**
 * Express application instance.
 */
const app = express();

/**
 * Native HTTP server required for Socket.IO integration.
 */
const server = http.createServer(app);

// -------------------------------------------------------------
// CORS Configuration
// -------------------------------------------------------------

/**
 * Allowed origins for CORS requests.
 * Loaded from the `ORIGIN` environment variable or defaults to localhost.
 */
app.use(
  cors({
    origin: process.env.ORIGIN?.split(',') || "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);

/**
 * Socket.IO real-time server instance with CORS rules.
 */
const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN?.split(',') || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// -------------------------------------------------------------
// Room Structure Definition
// -------------------------------------------------------------

/**
 * Represents a mapping of rooms, where each room contains connected socket users.
 *
 * @typedef {Object} Room
 * @property {Object.<string, Object>} [roomId] - Room identifier.
 * @property {Object.<string, {userId: string, displayName: string, photoURL?: string}>} [socketId]
 * A collection of socket users inside the room.
 */
interface Room {
  [roomId: string]: {
    [socketId: string]: {
      userId: string;
      displayName: string;
      photoURL?: string;
    };
  };
}

/**
 * In-memory storage of active rooms and their users.
 */
const rooms: Room = {};

// -------------------------------------------------------------
// Socket.IO Events
// -------------------------------------------------------------

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // -----------------------------------------------------------
  // JOIN ROOM
  // -----------------------------------------------------------

  /**
   * Event triggered when a user joins a room.
   *
   * @event join:room
   * @param {string} roomId - The room identifier.
   * @param {Object} userInfo - User metadata such as name, id, and avatar.
   */
  socket.on('join:room', (roomId: string, userInfo: any) => {
    console.log(`👤 ${userInfo.displayName} (${socket.id}) joined room: ${roomId}`);

    const currentCount = rooms[roomId]
      ? Object.keys(rooms[roomId]).length
      : 0;

    // Limit 10 users per room
    if (currentCount >= 10) {
      socket.emit('room:full');
      return;
    }

    socket.join(roomId);

    // Initialize room if it doesn't exist
    if (!rooms[roomId]) rooms[roomId] = {};

    // Save user info in the room
    rooms[roomId][socket.id] = userInfo;

    // Notify others in the room
    socket.to(roomId).emit('user:joined', {
      socketId: socket.id,
      userInfo,
    });

    // Send list of existing users back to the newly joined user
    const existingUsers = Object.keys(rooms[roomId])
      .filter((id) => id !== socket.id)
      .map((id) => ({
        socketId: id,
        userInfo: rooms[roomId][id],
      }));

    socket.emit('existing:users', existingUsers);

    console.log(`📊 Users in room ${roomId}:`, Object.keys(rooms[roomId]).length);
  });

  // -----------------------------------------------------------
  // CHAT MESSAGE
  // -----------------------------------------------------------

  /**
   * Broadcasts a chat message to all users inside a room.
   *
   * @event chat:message
   * @param {Object} data - The chat message payload.
   * @param {string} data.roomId - Target room.
   * @param {string} data.userName - Sender's display name.
   * @param {string} data.message - Text content.
   */
  socket.on('chat:message', (data) => {
    console.log(`💬 Message from ${data.userName}: ${data.message}`);
    io.to(data.roomId).emit('chat:message', data);
  });

  // -----------------------------------------------------------
  // DISCONNECT
  // -----------------------------------------------------------

  /**
   * Handles user disconnection, removing them from their room
   * and notifying remaining users.
   *
   * @event disconnect
   */
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);

    // Find the room the user was in
    for (const roomId in rooms) {
      if (rooms[roomId][socket.id]) {
        const userInfo = rooms[roomId][socket.id];

        // Remove the user from the room
        delete rooms[roomId][socket.id];

        // Notify others
        socket.to(roomId).emit('user:left', {
          socketId: socket.id,
          userInfo,
        });

        console.log(`👋 ${userInfo.displayName} left room ${roomId}`);

        // Remove empty rooms
        if (Object.keys(rooms[roomId]).length === 0) {
          delete rooms[roomId];
          console.log(`🗑️ Room ${roomId} deleted (empty)`);
        }

        break;
      }
    }
  });
});

// -------------------------------------------------------------
// Server Initialization
// -------------------------------------------------------------

/**
 * Port where the chat server will run.
 * Defaults to 3000 to avoid collisions with other services.
 */
const PORT = Number(process.env.PORT) || 3000;

/**
 * Starts the HTTP + WebSocket server.
 */
server.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
});