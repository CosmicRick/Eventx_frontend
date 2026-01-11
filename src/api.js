import axios from "axios";

// Use environment variable for API base URL, fallback to production URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://backend-five-self-11.vercel.app';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;