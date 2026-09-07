# FreeChatting 💬

A full-stack real-time chat application built with React Native, Expo, Node.js, Express, MongoDB, Clerk, Cloudinary, and WebSockets.

FreeChatting allows users to authenticate securely, find other users, start conversations, exchange messages in real time, share stories, and upload media.

## 📸 Screenshots

Sign Up 🆕

<img width="435" height="833" alt="Sign_Up Page" src="https://github.com/user-attachments/assets/7b9e07d5-7a39-45f7-9519-5d866ae07cd2" />

<br><br>

Sign In 🔐

<img width="435" height="833" alt="Sign_In Page" src="https://github.com/user-attachments/assets/255017bc-a5f9-4853-9b2d-00943b1e3013" />

<br><br>

Conversation Screen 💬

<img width="435" height="833" alt="Conversation Screen" src="https://github.com/user-attachments/assets/0bb9c34f-6fdd-494d-b2ec-5dae1728b7bd" />



## 🚀 Features

- 🔐 User authentication with Clerk
- 👤 User profiles
- 🔎 Search users
- 💬 One-to-one conversations
- ⚡ Real-time messaging with WebSockets
- 📖 Stories feature
- 🖼️ Image/media uploads with Cloudinary
- 🟢 Online user status
- ✍️ Typing indicators
- 📞 Voice and video calling (In Progress)
- 📱 Cross-platform application using Expo
- 🌐 Web support
- 🗄️ MongoDB database

## 🛠️ Tech Stack

### Frontend

- React Native
- Expo
- Expo Router
- TypeScript
- Axios
- Clerk Expo

### Backend

- Node.js
- Express.js
- TypeScript
- MongoDB
- Mongoose
- WebSocket
- Clerk Express
- Cloudinary
- Multer

## 📁 Project Structure

```text
freechatting/
│
├── src/                  # Expo application
│   ├── app/              # App screens and routes
│   ├── components/       # Reusable components
│   ├── constants/        # App configuration
│   ├── context/          # Application state/context
│   └── ...
│
├── server/               # Backend server
│   ├── config/           # Database configuration
│   ├── controllers/      # API controllers
│   ├── models/           # MongoDB models
│   ├── routes/           # API routes
│   ├── socket/           # WebSocket functionality
│   ├── server.ts         # Server entry point
│   └── package.json
│
├── assets/               # Application assets
├── .env                  # Environment variables (not committed)
├── package.json
└── README.md
```
### ⚙️ Installation
1. Clone the repository
```
git clone https://github.com/yashtailor3009/freechatting.git
cd freechatting
```

2. Install frontend dependencies
```
npm install
```
3. Install backend dependencies
```
cd server
npm install
```
4. Configure environment variables

Create a .env file inside the server directory:
```
MONGODB_URI=your_mongodb_connection_string

CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

Create/configure the frontend .env file in the project root:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
EXPO_PUBLIC_CLERK_FRONTEND_API=your_clerk_frontend_api
```

⚠️ Never commit .env files or API secrets to GitHub.

### ▶️ Running the Backend
From the server directory:
```
npm start
```

The backend runs on:
```
http://localhost:3000
```

Health check:
```
http://localhost:3000/health
```

### ▶️ Running the Frontend
From the project root:
```
npx expo start
```
For web:
```
http://localhost:8081
```
You can also run the application using an Android emulator, iOS simulator, or Expo development build.

### 🔌 API

The backend provides endpoints for:
```
/api/users
/api/messages
/api/stories
```
The application also uses WebSockets for real-time communication.

### 🔐 Security
Sensitive credentials are stored using environment variables.
The following files should never be committed:
```
.env
server/.env
```
Make sure they are included in .gitignore.

### 📌 Current Status
The application is currently under active development.
Implemented functionality includes:

- Authentication
- User search
- Conversations
- Real-time messaging
- Stories
- Media upload
- WebSocket communication

#### 🚧 In Progress

- Voice and video calling
- Push notifications
- End-to-end encryption
- Group chats
- Message reply & forwarding
- Advanced search filters


### 👨‍💻 Author

**Yash Tailor**
GitHub: @yashtailor3009

### 📄 License
This project is for learning and development purposes.
