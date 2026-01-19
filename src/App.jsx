import React, { useState, useEffect, useCallback, memo, createContext, useContext } from 'react';
import { Camera, Users, Settings, LogOut, Plus, Copy, Mail, Lock, Video, Mic, MessageSquare, Share2, Clock, Trash2, CheckCircle, XCircle, AlertCircle, UserPlus, Crown, User, Server, Send, RefreshCw, ChevronRight, Calendar, Play, Home, Menu, X, Loader2, Link2, ExternalLink, Database } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Set this to your Cloudflare Worker URL after deployment
// Example: https://plugnmeet-api.your-subdomain.workers.dev
const API_URL = import.meta.env.VITE_API_URL || '';

// If API_URL is empty, app runs in local mode (localStorage only)
const isLocalMode = !API_URL;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

async function generateSignature(body, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(body);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const api = {
  token: null,

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  },

  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    
    return data;
  },

  // Auth
  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async register(name, email, password) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
  },

  async logout() {
    this.setToken(null);
  },

  // Meetings
  async getMeetings() {
    return this.request('/api/meetings');
  },

  async createMeeting(meeting) {
    return this.request('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(meeting)
    });
  },

  async deleteMeeting(id) {
    return this.request(`/api/meetings/${id}`, { method: 'DELETE' });
  },

  // Invites
  async getInvites() {
    return this.request('/api/invites');
  },

  async createInvite(invite) {
    return this.request('/api/invites', {
      method: 'POST',
      body: JSON.stringify(invite)
    });
  },

  async deleteInvite(id) {
    return this.request(`/api/invites/${id}`, { method: 'DELETE' });
  },

  // Users
  async getUsers() {
    return this.request('/api/users');
  },

  // Config
  async getConfig() {
    return this.request('/api/config');
  },

  async saveServerConfig(config) {
    return this.request('/api/config/server', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  },

  async saveSmtpConfig(config) {
    return this.request('/api/config/smtp', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  },

  // Email
  async sendInviteEmail(data) {
    return this.request('/api/email/invite', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async sendResetEmail(email) {
    return this.request('/api/email/reset', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE (Fallback when no API)
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'plugnmeet_manager_data';

const localStore = {
  data: null,

  load() {
    if (this.data) return this.data;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.data = stored ? JSON.parse(stored) : {
        users: [{ id: 'admin-1', name: 'Admin User', email: 'admin@example.com', password: 'admin123', role: 'admin', createdAt: Date.now() }],
        serverConfig: null,
        smtpConfig: null,
        meetings: [],
        invites: []
      };
    } catch {
      this.data = { users: [], serverConfig: null, smtpConfig: null, meetings: [], invites: [] };
    }
    return this.data;
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  },

  get(key) {
    return this.load()[key];
  },

  set(key, value) {
    this.load()[key] = value;
    this.save();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const Notification = memo(({ notification }) => {
  if (!notification) return null;
  const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', warning: 'bg-amber-500', info: 'bg-blue-500' };
  const icons = { success: <CheckCircle className="w-5 h-5" />, error: <XCircle className="w-5 h-5" />, warning: <AlertCircle className="w-5 h-5" />, info: <Database className="w-5 h-5" /> };
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl text-white shadow-2xl ${colors[notification.type]} animate-slide-in max-w-md`}>
      {icons[notification.type]}
      <span className="font-medium">{notification.message}</span>
    </div>
  );
});

const Input = memo(({ icon: Icon, className = '', ...props }) => (
  <div className="relative">
    {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />}
    <input
      {...props}
      className={`w-full ${Icon ? 'pl-12' : 'px-4'} pr-4 py-3.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all ${className}`}
    />
  </div>
));

const Select = memo(({ children, className = '', ...props }) => (
  <select {...props} className={`w-full px-4 py-3.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all ${className}`}>
    {children}
  </select>
));

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

export default function PlugNMeetManager() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [users, setUsers] = useState([]);
  const [serverConfig, setServerConfig] = useState(null);
  const [smtpConfig, setSmtpConfig] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [invites, setInvites] = useState([]);

  // UI state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showJoinLinkModal, setShowJoinLinkModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [generatedJoinLink, setGeneratedJoinLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form states
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [serverForm, setServerForm] = useState({ url: '', apiKey: '', apiSecret: '' });
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, user: '', password: '', from: '', encryption: 'starttls' });
  const [meetingForm, setMeetingForm] = useState({ title: '', welcomeMessage: '', maxParticipants: 100, allowWebcams: true, allowScreenShare: true, allowChat: true, allowRecording: true, muteOnStart: false, waitingRoom: false, duration: 0 });
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', isAdmin: false });
  const [joinLinkForm, setJoinLinkForm] = useState({ name: '', isAdmin: false });

  // ─────────────────────────────────────────────────────────────────────────
  // NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (isLocalMode) {
      setMeetings(localStore.get('meetings') || []);
      setInvites(localStore.get('invites') || []);
      setUsers(localStore.get('users') || []);
      setServerConfig(localStore.get('serverConfig'));
      setSmtpConfig(localStore.get('smtpConfig'));
      return;
    }

    try {
      const [meetingsRes, invitesRes, configRes] = await Promise.all([
        api.getMeetings(),
        api.getInvites(),
        currentUser?.role === 'admin' ? api.getConfig() : Promise.resolve({})
      ]);
      
      setMeetings(meetingsRes.meetings || []);
      setInvites(invitesRes.invites || []);
      if (configRes.serverConfig) setServerConfig(configRes.serverConfig);
      if (configRes.smtpConfig) setSmtpConfig(configRes.smtpConfig);
      
      if (currentUser?.role === 'admin') {
        const usersRes = await api.getUsers();
        setUsers(usersRes.users || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, [currentUser]);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (isLocalMode) {
        // Local mode: check localStorage for logged in user
        const savedUser = localStorage.getItem('current_user');
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
          setIsAuthenticated(true);
        }
        setAuthLoading(false);
        return;
      }

      // API mode: verify token
      const token = api.getToken();
      if (token) {
        try {
          const configRes = await api.getConfig().catch(() => null);
          if (configRes) {
            // Token is valid, we need to get user info
            // For now, we'll store user in localStorage after login
            const savedUser = localStorage.getItem('current_user');
            if (savedUser) {
              setCurrentUser(JSON.parse(savedUser));
              setIsAuthenticated(true);
            }
          }
        } catch {
          api.setToken(null);
        }
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      loadData();
    }
  }, [isAuthenticated, currentUser, loadData]);

  // Sync form values from config
  useEffect(() => {
    if (serverConfig) setServerForm(serverConfig);
    if (smtpConfig) setSmtpForm(smtpConfig);
  }, [serverConfig, smtpConfig]);

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLocalMode) {
        const users = localStore.get('users') || [];
        const user = users.find(u => u.email === loginForm.email && u.password === loginForm.password);
        if (user) {
          const { password: _, ...safeUser } = user;
          setCurrentUser(safeUser);
          setIsAuthenticated(true);
          localStorage.setItem('current_user', JSON.stringify(safeUser));
          showNotification(`Welcome back, ${user.name}!`);
        } else {
          showNotification('Invalid email or password', 'error');
        }
      } else {
        const result = await api.login(loginForm.email, loginForm.password);
        if (result.user) {
          setCurrentUser(result.user);
          setIsAuthenticated(true);
          localStorage.setItem('current_user', JSON.stringify(result.user));
          showNotification(`Welcome back, ${result.user.name}!`);
        }
      }
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      showNotification(err.message || 'Login failed', 'error');
    }
    setLoading(false);
  }, [loginForm, showNotification]);

  const handleRegister = useCallback(async (e) => {
    e.preventDefault();
    if (registerForm.password !== registerForm.confirmPassword) {
      showNotification('Passwords do not match', 'error');
      return;
    }
    setLoading(true);

    try {
      if (isLocalMode) {
        const users = localStore.get('users') || [];
        if (users.find(u => u.email === registerForm.email)) {
          showNotification('Email already registered', 'error');
          setLoading(false);
          return;
        }
        const newUser = { id: generateId(), name: registerForm.name, email: registerForm.email, password: registerForm.password, role: 'moderator', createdAt: Date.now() };
        localStore.set('users', [...users, newUser]);
        showNotification('Account created! Please log in.');
      } else {
        await api.register(registerForm.name, registerForm.email, registerForm.password);
        showNotification('Account created! Please log in.');
      }
      setAuthMode('login');
      setRegisterForm({ name: '', email: '', password: '', confirmPassword: '' });
    } catch (err) {
      showNotification(err.message || 'Registration failed', 'error');
    }
    setLoading(false);
  }, [registerForm, showNotification]);

  const handleForgotPassword = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLocalMode) {
        showNotification('Password reset requires API backend', 'warning');
      } else {
        await api.sendResetEmail(forgotForm.email);
        showNotification('If email exists, reset link was sent');
      }
    } catch (err) {
      showNotification('Reset request sent (if email exists)');
    }
    setLoading(false);
  }, [forgotForm, showNotification]);

  const handleLogout = useCallback(() => {
    api.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem('current_user');
    setActiveTab('dashboard');
    showNotification('Logged out successfully');
  }, [showNotification]);

  // ─────────────────────────────────────────────────────────────────────────
  // PLUGNMEET API HELPER
  // ─────────────────────────────────────────────────────────────────────────

  const plugnmeetApi = useCallback(async (endpoint, body) => {
    if (!serverConfig) throw new Error('Server not configured');
    const bodyStr = JSON.stringify(body);
    const signature = await generateSignature(bodyStr, serverConfig.apiSecret);
    const response = await fetch(`${serverConfig.url}/auth${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API-KEY': serverConfig.apiKey, 'HASH-SIGNATURE': signature },
      body: bodyStr
    });
    return response.json();
  }, [serverConfig]);

  // ─────────────────────────────────────────────────────────────────────────
  // MEETING HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateMeeting = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);

    const roomId = `room-${generateId()}`;
    const meetingData = {
      title: meetingForm.title,
      roomId,
      welcomeMessage: meetingForm.welcomeMessage,
      maxParticipants: meetingForm.maxParticipants,
      settings: {
        allowWebcams: meetingForm.allowWebcams,
        allowScreenShare: meetingForm.allowScreenShare,
        allowChat: meetingForm.allowChat,
        allowRecording: meetingForm.allowRecording,
        muteOnStart: meetingForm.muteOnStart,
        waitingRoom: meetingForm.waitingRoom,
        duration: meetingForm.duration
      },
      status: 'scheduled'
    };

    // Create on PlugNMeet server if configured
    if (serverConfig) {
      try {
        const result = await plugnmeetApi('/room/create', {
          room_id: roomId,
          max_participants: meetingForm.maxParticipants,
          metadata: {
            room_title: meetingForm.title,
            welcome_message: meetingForm.welcomeMessage,
            room_features: {
              allow_webcams: meetingForm.allowWebcams,
              mute_on_start: meetingForm.muteOnStart,
              allow_screen_share: meetingForm.allowScreenShare,
              allow_rtmp: true,
              allow_view_other_webcams: true,
              allow_view_other_users_list: true,
              allow_virtual_bg: true,
              allow_raise_hand: true,
              room_duration: meetingForm.duration,
              recording_features: { is_allow: meetingForm.allowRecording, is_allow_cloud: true, is_allow_local: true },
              chat_features: { is_allow: meetingForm.allowChat, is_allow_file_upload: true },
              shared_note_pad_features: { is_allow: true },
              whiteboard_features: { is_allow: true },
              waiting_room_features: { is_active: meetingForm.waitingRoom },
              breakout_room_features: { is_allow: true, allowed_number_rooms: 6 },
              display_external_link_features: { is_allow: true },
              polls_features: { is_allow: true }
            }
          }
        });
        if (result.status) {
          meetingData.status = 'active';
          meetingData.sid = result.room_info?.sid;
        }
      } catch (err) {
        console.error('PlugNMeet API error:', err);
      }
    }

    try {
      if (isLocalMode) {
        const newMeeting = { id: generateId(), ...meetingData, createdBy: currentUser.id, createdAt: Date.now() };
        const currentMeetings = localStore.get('meetings') || [];
        localStore.set('meetings', [...currentMeetings, newMeeting]);
        setMeetings([...currentMeetings, newMeeting]);
      } else {
        const result = await api.createMeeting(meetingData);
        setMeetings(prev => [...prev, result.meeting]);
      }
      showNotification('Meeting created!');
      setShowNewMeeting(false);
      setMeetingForm({ title: '', welcomeMessage: '', maxParticipants: 100, allowWebcams: true, allowScreenShare: true, allowChat: true, allowRecording: true, muteOnStart: false, waitingRoom: false, duration: 0 });
    } catch (err) {
      showNotification(err.message || 'Failed to create meeting', 'error');
    }
    setLoading(false);
  }, [meetingForm, currentUser, serverConfig, plugnmeetApi, showNotification]);

  const handleDeleteMeeting = useCallback(async (meeting) => {
    if (!confirm('Delete this meeting?')) return;

    // End room on PlugNMeet if active
    if (serverConfig && meeting.status === 'active') {
      try { await plugnmeetApi('/room/end', { room_id: meeting.roomId }); } catch {}
    }

    try {
      if (isLocalMode) {
        const updated = meetings.filter(m => m.id !== meeting.id);
        localStore.set('meetings', updated);
        setMeetings(updated);
      } else {
        await api.deleteMeeting(meeting.id);
        setMeetings(prev => prev.filter(m => m.id !== meeting.id));
      }
      showNotification('Meeting deleted');
    } catch (err) {
      showNotification(err.message || 'Failed to delete', 'error');
    }
  }, [meetings, serverConfig, plugnmeetApi, showNotification]);

  // ─────────────────────────────────────────────────────────────────────────
  // JOIN LINK GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  const handleGenerateJoinLink = useCallback(async (e) => {
    e.preventDefault();
    if (!serverConfig) {
      showNotification('Configure PlugNMeet server first', 'error');
      return;
    }
    setLoading(true);

    try {
      const result = await plugnmeetApi('/room/getJoinToken', {
        room_id: selectedMeeting.roomId,
        user_info: {
          name: joinLinkForm.name,
          user_id: `user-${generateId()}`,
          is_admin: joinLinkForm.isAdmin,
          is_hidden: false
        }
      });

      if (result.status && result.token) {
        const joinUrl = `${serverConfig.url}/?access_token=${result.token}`;
        setGeneratedJoinLink(joinUrl);
        showNotification('Join link generated!');
      } else {
        showNotification('Failed: ' + (result.msg || 'Unknown error'), 'error');
      }
    } catch (err) {
      showNotification('API error: ' + err.message, 'error');
    }
    setLoading(false);
  }, [serverConfig, selectedMeeting, joinLinkForm, plugnmeetApi, showNotification]);

  // ─────────────────────────────────────────────────────────────────────────
  // INVITE HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleSendInvite = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);

    const inviteData = {
      meetingId: selectedMeeting.id,
      meetingTitle: selectedMeeting.title,
      roomId: selectedMeeting.roomId,
      name: inviteForm.name,
      email: inviteForm.email,
      isAdmin: inviteForm.isAdmin
    };

    try {
      let newInvite;
      if (isLocalMode) {
        newInvite = { id: generateId(), ...inviteData, createdAt: Date.now(), status: 'pending' };
        const currentInvites = localStore.get('invites') || [];
        localStore.set('invites', [...currentInvites, newInvite]);
        setInvites([...currentInvites, newInvite]);
      } else {
        const result = await api.createInvite(inviteData);
        newInvite = result.invite;
        setInvites(prev => [...prev, newInvite]);
      }

      // Send email if not local mode
      if (!isLocalMode) {
        try {
          // Generate join link for email
          let joinLink = '';
          if (serverConfig) {
            const tokenResult = await plugnmeetApi('/room/getJoinToken', {
              room_id: selectedMeeting.roomId,
              user_info: { name: inviteForm.name, user_id: `user-${generateId()}`, is_admin: inviteForm.isAdmin, is_hidden: false }
            });
            if (tokenResult.status && tokenResult.token) {
              joinLink = `${serverConfig.url}/?access_token=${tokenResult.token}`;
            }
          }

          await api.sendInviteEmail({
            to: inviteForm.email,
            name: inviteForm.name,
            meetingTitle: selectedMeeting.title,
            joinLink,
            isAdmin: inviteForm.isAdmin
          });
          showNotification(`Invitation sent to ${inviteForm.email}!`);
        } catch (emailErr) {
          showNotification('Invite saved but email failed: ' + emailErr.message, 'warning');
        }
      } else {
        showNotification('Invite saved (email requires API backend)', 'info');
      }

      setInviteForm({ name: '', email: '', isAdmin: false });
      setShowInviteModal(false);
    } catch (err) {
      showNotification(err.message || 'Failed to create invite', 'error');
    }
    setLoading(false);
  }, [inviteForm, selectedMeeting, serverConfig, plugnmeetApi, showNotification]);

  const handleDeleteInvite = useCallback(async (invite) => {
    try {
      if (isLocalMode) {
        const updated = invites.filter(i => i.id !== invite.id);
        localStore.set('invites', updated);
        setInvites(updated);
      } else {
        await api.deleteInvite(invite.id);
        setInvites(prev => prev.filter(i => i.id !== invite.id));
      }
      showNotification('Invite deleted');
    } catch (err) {
      showNotification(err.message || 'Failed to delete', 'error');
    }
  }, [invites, showNotification]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleSaveServerConfig = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLocalMode) {
        localStore.set('serverConfig', serverForm);
        setServerConfig(serverForm);
      } else {
        await api.saveServerConfig(serverForm);
        setServerConfig(serverForm);
      }
      showNotification('Server config saved!');
    } catch (err) {
      showNotification(err.message || 'Failed to save', 'error');
    }
    setLoading(false);
  }, [serverForm, showNotification]);

  const handleSaveSmtpConfig = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLocalMode) {
        localStore.set('smtpConfig', smtpForm);
        setSmtpConfig(smtpForm);
        showNotification('SMTP config saved (email requires API backend)', 'info');
      } else {
        await api.saveSmtpConfig(smtpForm);
        setSmtpConfig(smtpForm);
        showNotification('SMTP config saved!');
      }
    } catch (err) {
      showNotification(err.message || 'Failed to save', 'error');
    }
    setLoading(false);
  }, [smtpForm, showNotification]);

  const handleTestConnection = useCallback(async () => {
    if (!serverForm.url || !serverForm.apiKey || !serverForm.apiSecret) {
      showNotification('Fill all server fields first', 'error');
      return;
    }
    setLoading(true);

    try {
      const bodyStr = JSON.stringify({});
      const signature = await generateSignature(bodyStr, serverForm.apiSecret);
      const response = await fetch(`${serverForm.url}/auth/room/getActiveRoomsInfo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'API-KEY': serverForm.apiKey, 'HASH-SIGNATURE': signature },
        body: bodyStr
      });
      const result = await response.json();
      if (result.status !== undefined) {
        showNotification('Connection successful!');
      } else {
        showNotification('Connection failed', 'error');
      }
    } catch (err) {
      showNotification('Connection failed: ' + err.message, 'error');
    }
    setLoading(false);
  }, [serverForm, showNotification]);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text);
    showNotification('Copied!');
  }, [showNotification]);

  const openJoinLinkModal = useCallback((meeting) => {
    setSelectedMeeting(meeting);
    setJoinLinkForm({ name: '', isAdmin: false });
    setGeneratedJoinLink('');
    setShowJoinLinkModal(true);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH SCREEN
  // ─────────────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen min-h-dvh bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <Notification notification={notification} />
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        <div className="relative w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-2xl shadow-violet-500/30 mb-4">
              <Video className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">PlugNMeet</h1>
            <p className="text-slate-400 mt-1">Meeting Management System</p>
          </div>

          {/* Mode indicator */}
          <div className={`mb-4 px-4 py-2 rounded-xl text-center text-sm ${isLocalMode ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {isLocalMode ? '🔒 Local Mode (data in browser)' : '☁️ Connected to API'}
          </div>

          <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800/50 shadow-2xl p-8">
            {authMode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <Input icon={Mail} type="email" value={loginForm.email} onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))} placeholder="you@example.com" required autoComplete="email" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                  <Input icon={Lock} type="password" value={loginForm.password} onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))} placeholder="••••••••" required autoComplete="current-password" />
                </div>
                <button type="submit" disabled={loading} className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                </button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" onClick={() => setAuthMode('forgot')} className="text-slate-400 hover:text-violet-400 transition-colors">Forgot password?</button>
                  <button type="button" onClick={() => setAuthMode('register')} className="text-violet-400 hover:text-violet-300 transition-colors">Create account</button>
                </div>
              </form>
            )}
            {authMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                  <Input type="text" value={registerForm.name} onChange={(e) => setRegisterForm(prev => ({ ...prev, name: e.target.value }))} placeholder="John Doe" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <Input type="email" value={registerForm.email} onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))} placeholder="you@example.com" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                  <Input type="password" value={registerForm.password} onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))} placeholder="••••••••" required minLength={6} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                  <Input type="password" value={registerForm.confirmPassword} onChange={(e) => setRegisterForm(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder="••••••••" required />
                </div>
                <button type="submit" disabled={loading} className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
                </button>
                <button type="button" onClick={() => setAuthMode('login')} className="w-full text-sm text-slate-400 hover:text-violet-400 transition-colors">Already have an account? Sign in</button>
              </form>
            )}
            {authMode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Reset Password</h3>
                  <p className="text-sm text-slate-400 mt-1">Enter your email to receive a reset link</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <Input type="email" value={forgotForm.email} onChange={(e) => setForgotForm(prev => ({ ...prev, email: e.target.value }))} placeholder="you@example.com" required />
                </div>
                <button type="submit" disabled={loading} className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                </button>
                <button type="button" onClick={() => setAuthMode('login')} className="w-full text-sm text-slate-400 hover:text-violet-400 transition-colors">Back to sign in</button>
              </form>
            )}
          </div>
          <div className="mt-6 p-4 bg-slate-900/50 backdrop-blur rounded-2xl border border-slate-800/50">
            <p className="text-xs text-slate-500 text-center">Demo: <span className="text-slate-400">admin@example.com</span> / <span className="text-slate-400">admin123</span></p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN APP
  // ─────────────────────────────────────────────────────────────────────────

  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'meetings', icon: Video, label: 'Meetings' },
    { id: 'invites', icon: Mail, label: 'Invitations' },
    ...(currentUser?.role === 'admin' ? [{ id: 'users', icon: Users, label: 'Users' }, { id: 'settings', icon: Settings, label: 'Settings' }] : []),
  ];

  return (
    <div className="min-h-screen min-h-dvh bg-slate-950">
      <Notification notification={notification} />
      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-72 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800/50 z-50 transform transition-transform duration-300 lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">PlugNMeet</h1>
              <p className="text-xs text-slate-400">Meeting Manager</p>
            </div>
          </div>
          {/* Mode badge */}
          <div className={`mb-6 px-3 py-1.5 rounded-lg text-xs font-medium ${isLocalMode ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {isLocalMode ? '🔒 Local Mode' : '☁️ Cloud Sync'}
          </div>
          <nav className="space-y-2">
            {navItems.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
                <item.icon className="w-5 h-5" /><span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-slate-800/50">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${currentUser?.role === 'admin' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-violet-500 to-fuchsia-600'}`}>
              {currentUser?.role === 'admin' ? <Crown className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{currentUser?.name}</p>
              <p className="text-xs text-slate-400 truncate">{currentUser?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-xl transition-colors">
            <LogOut className="w-4 h-4" />Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-72">
        <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><Menu className="w-6 h-6" /></button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              {!serverConfig && currentUser?.role === 'admin' && (
                <button onClick={() => setActiveTab('settings')} className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30">
                  <AlertCircle className="w-4 h-4" /><span className="hidden sm:inline">Configure Server</span>
                </button>
              )}
              <button onClick={() => setShowNewMeeting(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /><span className="hidden sm:inline">New Meeting</span>
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8">
          {/* Dashboard */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Meetings', value: meetings.length, icon: Video },
                  { label: 'Active', value: meetings.filter(m => m.status === 'active').length, icon: Play },
                  { label: 'Invites', value: invites.length, icon: UserPlus },
                  { label: 'Users', value: users.length, icon: Users },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm">{stat.label}</p>
                        <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <stat.icon className="w-8 h-8 text-slate-600" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">PlugNMeet Server</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${serverConfig ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="text-slate-300">{serverConfig ? serverConfig.url : 'Not configured'}</span>
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Data Storage</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isLocalMode ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="text-slate-300">{isLocalMode ? 'Browser localStorage' : 'Cloudflare KV (synced)'}</span>
                  </div>
                </div>
              </div>

              {/* Recent Meetings */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Recent Meetings</h3>
                  <button onClick={() => setActiveTab('meetings')} className="text-sm text-violet-400 hover:text-violet-300">View all →</button>
                </div>
                {meetings.length === 0 ? (
                  <div className="text-center py-8">
                    <Video className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No meetings yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {meetings.slice(0, 5).map(meeting => (
                      <div key={meeting.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl">
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${meeting.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                          <div>
                            <p className="font-medium text-white">{meeting.title}</p>
                            <p className="text-sm text-slate-400">{meeting.roomId}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openJoinLinkModal(meeting)} className="p-2 text-slate-400 hover:text-emerald-400 rounded-lg" title="Join Link"><Link2 className="w-5 h-5" /></button>
                          <button onClick={() => { setSelectedMeeting(meeting); setShowInviteModal(true); }} className="p-2 text-slate-400 hover:text-violet-400 rounded-lg" title="Invite"><UserPlus className="w-5 h-5" /></button>
                          <button onClick={() => copyToClipboard(meeting.roomId)} className="p-2 text-slate-400 hover:text-cyan-400 rounded-lg" title="Copy ID"><Copy className="w-5 h-5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meetings */}
          {activeTab === 'meetings' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Meetings</h2>
                <button onClick={() => setShowNewMeeting(true)} className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium">
                  <Plus className="w-5 h-5" />New Meeting
                </button>
              </div>
              {meetings.length === 0 ? (
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-12 text-center">
                  <Video className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No meetings yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {meetings.map(meeting => (
                    <div key={meeting.id} className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${meeting.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                            <h3 className="text-lg font-semibold text-white">{meeting.title}</h3>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs ${meeting.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/20 text-slate-400'}`}>{meeting.status}</span>
                        </div>
                        <div className="space-y-2 text-sm text-slate-400">
                          <p>Room: {meeting.roomId}</p>
                          <p>Max: {meeting.maxParticipants} participants</p>
                        </div>
                      </div>
                      <div className="px-6 py-4 bg-slate-800/30 border-t border-slate-700/30 flex gap-2">
                        <button onClick={() => openJoinLinkModal(meeting)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-xl"><Link2 className="w-4 h-4" />Join Link</button>
                        <button onClick={() => { setSelectedMeeting(meeting); setShowInviteModal(true); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-xl"><UserPlus className="w-4 h-4" />Invite</button>
                        <button onClick={() => handleDeleteMeeting(meeting)} className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Invites */}
          {activeTab === 'invites' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Invitations</h2>
              {invites.length === 0 ? (
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-12 text-center">
                  <Mail className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No invitations yet</p>
                </div>
              ) : (
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-700/50">
                      <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Name</th>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Email</th>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Meeting</th>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Role</th>
                      <th className="px-6 py-4"></th>
                    </tr></thead>
                    <tbody>
                      {invites.map(invite => (
                        <tr key={invite.id} className="border-b border-slate-700/30">
                          <td className="px-6 py-4 text-white">{invite.name}</td>
                          <td className="px-6 py-4 text-slate-400">{invite.email}</td>
                          <td className="px-6 py-4 text-slate-400">{invite.meetingTitle}</td>
                          <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs ${invite.isAdmin ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-600/20 text-slate-400'}`}>{invite.isAdmin ? 'Moderator' : 'Participant'}</span></td>
                          <td className="px-6 py-4"><button onClick={() => handleDeleteInvite(invite)} className="p-2 text-slate-400 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Users (Admin) */}
          {activeTab === 'users' && currentUser?.role === 'admin' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Users</h2>
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-700/50">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">User</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Email</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Role</th>
                  </tr></thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id} className="border-b border-slate-700/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-amber-500' : 'bg-violet-500'}`}>
                              {user.role === 'admin' ? <Crown className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-white" />}
                            </div>
                            <span className="text-white">{user.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400">{user.email}</td>
                        <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs ${user.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-violet-500/20 text-violet-400'}`}>{user.role}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settings (Admin) */}
          {activeTab === 'settings' && currentUser?.role === 'admin' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Settings</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Server Config */}
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Server className="w-8 h-8 text-violet-400" />
                    <h3 className="text-lg font-semibold text-white">PlugNMeet Server</h3>
                  </div>
                  <form onSubmit={handleSaveServerConfig} className="space-y-4">
                    <div><label className="block text-sm text-slate-300 mb-2">Server URL</label><Input value={serverForm.url} onChange={(e) => setServerForm(p => ({ ...p, url: e.target.value }))} placeholder="https://plugnmeet.example.com" /></div>
                    <div><label className="block text-sm text-slate-300 mb-2">API Key</label><Input value={serverForm.apiKey} onChange={(e) => setServerForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="plugnmeet" /></div>
                    <div><label className="block text-sm text-slate-300 mb-2">API Secret</label><Input type="password" value={serverForm.apiSecret} onChange={(e) => setServerForm(p => ({ ...p, apiSecret: e.target.value }))} placeholder="••••••••" /></div>
                    <div className="flex gap-3">
                      <button type="button" onClick={handleTestConnection} disabled={loading} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl flex items-center justify-center gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Test</button>
                      <button type="submit" className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl">Save</button>
                    </div>
                  </form>
                  {serverConfig && <div className="mt-4 p-3 bg-emerald-500/10 rounded-xl text-sm text-emerald-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Configured</div>}
                </div>

                {/* SMTP Config */}
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Mail className="w-8 h-8 text-cyan-400" />
                    <h3 className="text-lg font-semibold text-white">Email (SMTP)</h3>
                  </div>
                  <form onSubmit={handleSaveSmtpConfig} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-sm text-slate-300 mb-2">Host</label><Input value={smtpForm.host} onChange={(e) => setSmtpForm(p => ({ ...p, host: e.target.value }))} placeholder="smtp.example.com" /></div>
                      <div><label className="block text-sm text-slate-300 mb-2">Port</label><Input type="number" value={smtpForm.port} onChange={(e) => setSmtpForm(p => ({ ...p, port: parseInt(e.target.value) || 587 }))} /></div>
                    </div>
                    <div><label className="block text-sm text-slate-300 mb-2">Encryption</label>
                      <Select value={smtpForm.encryption} onChange={(e) => setSmtpForm(p => ({ ...p, encryption: e.target.value }))}>
                        <option value="none">None</option>
                        <option value="starttls">STARTTLS (587)</option>
                        <option value="ssl">SSL/TLS (465)</option>
                      </Select>
                    </div>
                    <div><label className="block text-sm text-slate-300 mb-2">Username</label><Input value={smtpForm.user} onChange={(e) => setSmtpForm(p => ({ ...p, user: e.target.value }))} /></div>
                    <div><label className="block text-sm text-slate-300 mb-2">Password</label><Input type="password" value={smtpForm.password} onChange={(e) => setSmtpForm(p => ({ ...p, password: e.target.value }))} /></div>
                    <div><label className="block text-sm text-slate-300 mb-2">From Address</label><Input type="email" value={smtpForm.from} onChange={(e) => setSmtpForm(p => ({ ...p, from: e.target.value }))} placeholder="noreply@example.com" /></div>
                    <button type="submit" className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl">Save</button>
                  </form>
                  {smtpConfig && <div className="mt-4 p-3 bg-emerald-500/10 rounded-xl text-sm text-emerald-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Configured</div>}
                  {isLocalMode && <p className="mt-4 text-xs text-slate-500">⚠️ Email sending requires the API backend (MailChannels/Resend)</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* New Meeting Modal */}
      {showNewMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 rounded-3xl border border-slate-800">
            <div className="sticky top-0 bg-slate-900 px-6 py-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Create Meeting</h3>
              <button onClick={() => setShowNewMeeting(false)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateMeeting} className="p-6 space-y-6">
              <div><label className="block text-sm text-slate-300 mb-2">Title *</label><Input value={meetingForm.title} onChange={(e) => setMeetingForm(p => ({ ...p, title: e.target.value }))} placeholder="Team Standup" required /></div>
              <div><label className="block text-sm text-slate-300 mb-2">Welcome Message</label><textarea value={meetingForm.welcomeMessage} onChange={(e) => setMeetingForm(p => ({ ...p, welcomeMessage: e.target.value }))} className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" rows={2} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-slate-300 mb-2">Max Participants</label><Input type="number" value={meetingForm.maxParticipants} onChange={(e) => setMeetingForm(p => ({ ...p, maxParticipants: parseInt(e.target.value) || 100 }))} /></div>
                <div><label className="block text-sm text-slate-300 mb-2">Duration (min)</label><Input type="number" value={meetingForm.duration} onChange={(e) => setMeetingForm(p => ({ ...p, duration: parseInt(e.target.value) || 0 }))} /></div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-3">Features</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'allowWebcams', icon: Camera, label: 'Webcams' },
                    { key: 'allowScreenShare', icon: Share2, label: 'Screen Share' },
                    { key: 'allowChat', icon: MessageSquare, label: 'Chat' },
                    { key: 'allowRecording', icon: Video, label: 'Recording' },
                    { key: 'muteOnStart', icon: Mic, label: 'Mute on Start' },
                    { key: 'waitingRoom', icon: Clock, label: 'Waiting Room' },
                  ].map(({ key, icon: Icon, label }) => (
                    <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${meetingForm[key] ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-slate-800/30 border-slate-700/30 text-slate-400'}`}>
                      <input type="checkbox" checked={meetingForm[key]} onChange={(e) => setMeetingForm(p => ({ ...p, [key]: e.target.checked }))} className="sr-only" />
                      <Icon className="w-5 h-5" /><span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowNewMeeting(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
              <div><h3 className="text-xl font-semibold text-white">Invite to Meeting</h3><p className="text-sm text-slate-400">{selectedMeeting.title}</p></div>
              <button onClick={() => setShowInviteModal(false)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSendInvite} className="p-6 space-y-4">
              <div><label className="block text-sm text-slate-300 mb-2">Name *</label><Input value={inviteForm.name} onChange={(e) => setInviteForm(p => ({ ...p, name: e.target.value }))} required /></div>
              <div><label className="block text-sm text-slate-300 mb-2">Email *</label><Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))} required /></div>
              <div>
                <label className="block text-sm text-slate-300 mb-3">Role</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer ${!inviteForm.isAdmin ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-slate-800/30 border-slate-700/30 text-slate-400'}`}>
                    <input type="radio" checked={!inviteForm.isAdmin} onChange={() => setInviteForm(p => ({ ...p, isAdmin: false }))} className="sr-only" />
                    <User className="w-5 h-5" />Participant
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer ${inviteForm.isAdmin ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-800/30 border-slate-700/30 text-slate-400'}`}>
                    <input type="radio" checked={inviteForm.isAdmin} onChange={() => setInviteForm(p => ({ ...p, isAdmin: true }))} className="sr-only" />
                    <Crown className="w-5 h-5" />Moderator
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 py-3 bg-slate-800 text-white rounded-xl">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-violet-600 text-white rounded-xl flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4" />Send</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Link Modal */}
      {showJoinLinkModal && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
              <div><h3 className="text-xl font-semibold text-white">Generate Join Link</h3><p className="text-sm text-slate-400">{selectedMeeting.title}</p></div>
              <button onClick={() => setShowJoinLinkModal(false)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleGenerateJoinLink} className="p-6 space-y-4">
              {!serverConfig && <div className="p-4 bg-amber-500/10 rounded-xl text-amber-400 text-sm">⚠️ Configure PlugNMeet server first</div>}
              <div><label className="block text-sm text-slate-300 mb-2">Name *</label><Input value={joinLinkForm.name} onChange={(e) => setJoinLinkForm(p => ({ ...p, name: e.target.value }))} required /></div>
              <div>
                <label className="block text-sm text-slate-300 mb-3">Role</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer ${!joinLinkForm.isAdmin ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-slate-800/30 border-slate-700/30 text-slate-400'}`}>
                    <input type="radio" checked={!joinLinkForm.isAdmin} onChange={() => setJoinLinkForm(p => ({ ...p, isAdmin: false }))} className="sr-only" /><User className="w-5 h-5" />Participant
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer ${joinLinkForm.isAdmin ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-800/30 border-slate-700/30 text-slate-400'}`}>
                    <input type="radio" checked={joinLinkForm.isAdmin} onChange={() => setJoinLinkForm(p => ({ ...p, isAdmin: true }))} className="sr-only" /><Crown className="w-5 h-5" />Moderator
                  </label>
                </div>
              </div>
              {generatedJoinLink && (
                <div className="p-4 bg-emerald-500/10 rounded-xl space-y-3">
                  <p className="text-emerald-400 text-sm font-medium">✓ Link Generated</p>
                  <div className="flex gap-2">
                    <input type="text" value={generatedJoinLink} readOnly className="flex-1 px-3 py-2 bg-slate-800 rounded-lg text-xs text-slate-300 font-mono" />
                    <button type="button" onClick={() => copyToClipboard(generatedJoinLink)} className="px-3 bg-slate-700 rounded-lg"><Copy className="w-4 h-4 text-white" /></button>
                  </div>
                  <a href={generatedJoinLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-emerald-400"><ExternalLink className="w-4 h-4" />Open</a>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowJoinLinkModal(false)} className="flex-1 py-3 bg-slate-800 text-white rounded-xl">Close</button>
                <button type="submit" disabled={loading || !serverConfig} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Link2 className="w-4 h-4" />Generate</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}
