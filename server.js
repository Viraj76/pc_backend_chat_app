const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);



const port = 3000;
app.use(express.json());


// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});


mongoose.connect('mongodb://localhost:27017/ChatAppWithNodeJs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Define Message Schema
const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Define ChatRoom Schema
const chatRoomSchema = new mongoose.Schema({
  chatRoomId: { type: String, required: true, unique: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }]
});

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

// Define a route to add users
app.post('/addUser', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).send('Username is required');
  }

  try {
    const newUser = new User({ username });
    await newUser.save();
    res.status(201).json({username});
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error'});
  }
});

// Define a route to fetch all users
app.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).send('Error fetching users');
  }
});

// Route to send message
app.post('/send-message', async (req, res) => {
  const { senderId, receiverId, message } = req.body;

  if (!senderId || !receiverId || !message) {
    return res.status(400).send('Sender ID, Receiver ID, and message are required');
  }

  try {
    // Check if sender and receiver exist
    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).send('Sender or receiver not found');
    }

    // Create chatRoomId
    const chatRoomId = createChatRoomId(senderId, receiverId);

    // Find or create chat room
    let chatRoom = await ChatRoom.findOne({ chatRoomId });
    if (!chatRoom) {
      chatRoom = new ChatRoom({
        chatRoomId,
        users: [senderId, receiverId],
        messages: []
      });
      await chatRoom.save();
    }

    // Create and save the message
    const newMessage = new Message({
      senderId: senderId,
      receiverId: receiverId,
      message
    });

    const savedMessage = await newMessage.save();

    // Add message to chat room
    chatRoom.messages.push(savedMessage._id);
    await chatRoom.save();

     // Emit the new message to all connected clients
     io.emit('newMessage', savedMessage);

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Route to fetch all messages in a chat room
app.get('/messages/:chatRoomId', async (req, res) => {
  const { chatRoomId } = req.params;

  try {
    // Find the chat room
    const chatRoom = await ChatRoom.findOne({ chatRoomId }).populate('messages');

    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    // Return the messages
    res.json(chatRoom.messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});


// Helper function to create chatRoomId
const createChatRoomId = (id1, id2) => {
  return [id1, id2].sort().join('_');
};