/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  List, 
  Plus, 
  Search, 
  LogOut, 
  AlertCircle,
  Key, 
  Navigation, 
  Phone, 
  User, 
  X,
  Loader2,
  MapPin,
  ExternalLink,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  MoreHorizontal,
  Eye,
  EyeOff,
  Moon,
  Sun,
  Monitor,
  Download,
  Menu,
  Trophy,
  Edit2,
  RefreshCw,
  WifiOff
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import Cookies from 'js-cookie';
import CryptoJS from 'crypto-js';
import { supabase } from './lib/supabase';
import { encrypt, decrypt, extractCoordsFromUrl, extractAddressFromUrl, getDistance } from './lib/utils';
import type { Client, DecryptedClient, AppUser } from './types';

const formatPhone = (phone: string) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
};

const CACHE_KEY = 'gmx_clients_cache';
const CACHE_TIMESTAMP_KEY = 'gmx_clients_cache_time';

const saveClientsToCache = (clientsData: Client[], key: string) => {
  try {
    const jsonStr = JSON.stringify(clientsData);
    const encrypted = CryptoJS.AES.encrypt(jsonStr, key).toString();
    localStorage.setItem(CACHE_KEY, encrypted);
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
    console.error("Error saving cache", e);
  }
};

const loadClientsFromCache = (key: string): Client[] | null => {
  try {
    const encrypted = localStorage.getItem(CACHE_KEY);
    if (!encrypted) return null;
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    const jsonStr = bytes.toString(CryptoJS.enc.Utf8);
    if (!jsonStr) return null;
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Error loading cache", e);
    return null;
  }
};

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [masterKey, setMasterKey] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<'search' | 'admin' | 'settings' | 'ranking'>('search');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [decryptedClients, setDecryptedClients] = useState<DecryptedClient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingClient, setEditingClient] = useState<DecryptedClient | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedClient, setSelectedClient] = useState<DecryptedClient | null>(null);

  // Admin states
  const [adminNewEmail, setAdminNewEmail] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [isSecuring, setIsSecuring] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [isEditingUser, setIsEditingUser] = useState(false);

  // Form states for adding client
  const [newClientUrl, setNewClientUrl] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [additionalPhoneTags, setAdditionalPhoneTags] = useState<string[]>([]);
  const [newClientAdditionalPhoneInput, setNewClientAdditionalPhoneInput] = useState('');
  const [newClientAddressText, setNewClientAddressText] = useState('');
  const [newClientNotes, setNewClientNotes] = useState('');
  const [newClientReferences, setNewClientReferences] = useState('');
  const [newClientRating, setNewClientRating] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [themePreference, setThemePreference] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('gmx_theme_pref');
    return (saved as 'light' | 'dark' | 'system') || 'system';
  });
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const COOKIE_SALT = "gmx-v1-secure-salt";
  const SYSTEM_AUTH_SECRET = "gmx-auth-v1-secure-key";

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const saveMasterKeyToCookie = (key: string, userPass: string) => {
    const encryptedKey = CryptoJS.AES.encrypt(key, userPass + COOKIE_SALT).toString();
    // Use sameSite: 'none' and secure: true for AI Studio iframe compatibility
    Cookies.set('gmx_mk', encryptedKey, { expires: 30, sameSite: 'none', secure: true });
  };

  const getMasterKeyFromCookie = (userPass: string) => {
    const saved = Cookies.get('gmx_mk');
    if (!saved) return "";
    try {
      const bytes = CryptoJS.AES.decrypt(saved, userPass + COOKIE_SALT);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      return "";
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      const isDark = themePreference === 'dark' || (themePreference === 'system' && mediaQuery.matches);
      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('gmx_theme_pref', themePreference);
    };

    applyTheme();
    
    const listener = () => {
      if (themePreference === 'system') applyTheme();
    };
    
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themePreference]);

  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifiedUser, setVerifiedUser] = useState<AppUser | null>(null);

  const checkVerificationToken = async (token: string) => {
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('verification_token', token)
        .single();

      if (error || !data) {
        setVerificationError("El enlace de verificación es inválido o no existe.");
      } else if (data.is_verified) {
        setVerificationError("Esta cuenta ya ha sido verificada. Por favor, inicia sesión.");
      } else if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
        setVerificationError("El enlace de verificación ha expirado.");
      } else {
        setVerifiedUser(data);
      }
    } catch (err) {
      setVerificationError("Error al verificar el enlace.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const savedUser = localStorage.getItem('gmx_user');
      const savedPass = localStorage.getItem('gmx_pass');
      
      if (savedUser && savedPass) {
        try {
          const parsedUser = JSON.parse(savedUser);
          
          if (!navigator.onLine) {
            // Trust cached user if offline
            setUser(parsedUser);
            const mk = getMasterKeyFromCookie(savedPass);
            if (mk) setMasterKey(mk);
            setIsOffline(true);
          } else {
            // Verificar que el usuario aún exista en la DB para evitar errores de Foreign Key
            const { data, error } = await supabase
              .from('app_users')
              .select('id, username, email, role, is_active, is_verified')
              .eq('id', parsedUser.id)
              .single();
              
            if (data && !error && data.is_active !== false) {
              setUser(data);
              localStorage.setItem('gmx_user', JSON.stringify(data));
              const mk = getMasterKeyFromCookie(savedPass);
              if (mk) setMasterKey(mk);
            } else if (error && error.message.includes('FetchError')) {
              // Network error, trust cache
              setUser(parsedUser);
              const mk = getMasterKeyFromCookie(savedPass);
              if (mk) setMasterKey(mk);
              setIsOffline(true);
            } else {
              // El usuario ya no existe o está inactivo
              handleLogout();
            }
          }
        } catch (e) {
          handleLogout();
        }
      }
      setIsAuthLoading(false);
    };

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('verify');
    if (token) {
      setVerificationToken(token);
      checkVerificationToken(token);
    } else {
      initAuth();
    }

    // Load persisted form state
    const savedForm = localStorage.getItem('gmx_pending_client');
    if (savedForm) {
      const form = JSON.parse(savedForm);
      setNewClientUrl(form.url || '');
      setNewClientName(form.name || '');
      setNewClientPhone(form.phone || '');
      setAdditionalPhoneTags(form.additionalPhoneTags || []);
      setNewClientAddressText(form.addressText || '');
      setNewClientNotes(form.notes || '');
      setNewClientReferences(form.references || '');
      setNewClientRating(form.rating || 5);
      setIsAdding(form.isAdding || false);
    }

    // Load search query
    const savedSearch = localStorage.getItem('gmx_search_query');
    if (savedSearch) setSearchQuery(savedSearch);

    // Load admin form
    const savedAdminForm = localStorage.getItem('gmx_pending_admin');
    if (savedAdminForm) {
      const form = JSON.parse(savedAdminForm);
      setAdminNewEmail(form.email || '');
      setAdminNewPassword(form.password || '');
    }
  }, []);

  const syncOfflineData = async () => {
    if (!masterKey || !user || isSyncing) return;
    
    const queueStr = localStorage.getItem('gmx_offline_queue');
    if (!queueStr) return;

    try {
      setIsSyncing(true);
      const queue = JSON.parse(queueStr);
      if (!Array.isArray(queue) || queue.length === 0) return;

      addToast(`Sincronizando ${queue.length} registros pendientes...`, "info");

      for (const item of queue) {
        if (item.action === 'insert') {
          await supabase.from('clients').insert({
            driver_id: user.id,
            ...item.data
          });
        } else if (item.action === 'update') {
          await supabase.from('clients').update(item.data).eq('id', item.id);
        } else if (item.action === 'delete') {
          await supabase.from('clients').delete().eq('id', item.id);
        }
      }

      localStorage.removeItem('gmx_offline_queue');
      addToast("Sincronización completada con éxito", "success");
      fetchClients(); // Refresh data from server
    } catch (err) {
      console.error("Error syncing offline data:", err);
      addToast("Error al sincronizar datos. Se reintentará más tarde.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineData();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [masterKey, user, isSyncing]);

  // Persist form state on changes
  useEffect(() => {
    if (user) {
      const formData = {
        url: newClientUrl,
        name: newClientName,
        phone: newClientPhone,
        additionalPhoneTags,
        addressText: newClientAddressText,
        notes: newClientNotes,
        references: newClientReferences,
        rating: newClientRating,
        isAdding
      };
      localStorage.setItem('gmx_pending_client', JSON.stringify(formData));
    }
  }, [newClientUrl, newClientName, newClientPhone, additionalPhoneTags, newClientAddressText, newClientNotes, newClientReferences, newClientRating, isAdding, user]);

  useEffect(() => {
    localStorage.setItem('gmx_search_query', searchQuery);
  }, [searchQuery]);

  // Auto-fill address text from URL if empty
  useEffect(() => {
    if (newClientUrl && !newClientAddressText) {
      const extractedAddress = extractAddressFromUrl(newClientUrl);
      if (extractedAddress) {
        setNewClientAddressText(extractedAddress);
      }
    }
  }, [newClientUrl]);

  useEffect(() => {
    if (user?.role === 'superadmin') {
      localStorage.setItem('gmx_pending_admin', JSON.stringify({
        email: adminNewEmail,
        password: adminNewPassword
      }));
    }
  }, [adminNewEmail, adminNewPassword, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement)?.blur();
    setAuthError(null);
    setIsLoggingIn(true);
    
    try {
      if (isOffline || !navigator.onLine) {
        // Try offline login
        const savedUser = localStorage.getItem('gmx_user');
        const savedPass = localStorage.getItem('gmx_pass');
        if (savedUser && savedPass) {
          const parsedUser = JSON.parse(savedUser);
          if ((parsedUser.username === username || parsedUser.email === username) && password === savedPass) {
            setUser(parsedUser);
            const mk = getMasterKeyFromCookie(savedPass);
            if (mk) setMasterKey(mk);
            addToast("Sesión iniciada (Modo sin conexión)", "info");
            setIsLoggingIn(false);
            return;
          }
        }
        addToast("No se puede iniciar sesión sin conexión (credenciales no coinciden o no hay caché)", "error");
        setIsLoggingIn(false);
        return;
      }

      // Allow login by email or username
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .or(`username.eq.${username},email.eq.${username}`)
        .single();

      if (error || !data) {
        addToast("Usuario o correo no encontrado", "error");
        return;
      }

      if (data.is_active === false) {
        addToast("Esta cuenta está desactivada. Contacta al administrador.", "error");
        return;
      }

      if (data.is_verified === false) {
        addToast("Esta cuenta no ha sido verificada. Revisa tu correo.", "error");
        return;
      }

      let isPasswordCorrect = false;
      const dbPass = data.encrypted_password;

      // Try to decrypt if it looks like encrypted data (starts with U2FsdGVkX1)
      if (dbPass && dbPass.startsWith('U2FsdGVkX1')) {
        try {
          const bytes = CryptoJS.AES.decrypt(dbPass, SYSTEM_AUTH_SECRET);
          const decrypted = bytes.toString(CryptoJS.enc.Utf8);
          isPasswordCorrect = decrypted === password;
        } catch (e) {
          isPasswordCorrect = false;
        }
      } else {
        // Plain text fallback
        isPasswordCorrect = dbPass === password;
      }

      if (isPasswordCorrect) {
        const userData: AppUser = {
          id: data.id,
          username: data.username,
          email: data.email,
          role: data.role as 'driver' | 'superadmin',
          is_active: data.is_active,
          is_verified: data.is_verified
        };
        setUser(userData);
        localStorage.setItem('gmx_user', JSON.stringify(userData));
        localStorage.setItem('gmx_pass', password);
        
        const mk = getMasterKeyFromCookie(password);
        if (mk) {
          setMasterKey(mk);
          addToast(`Bienvenido, ${data.username}`, "success");
        } else {
          addToast("Sesión iniciada. Ingresa la llave maestra.", "info");
        }
      } else {
        addToast("Contraseña incorrecta", "error");
      }
    } catch (err) {
      addToast("Error de conexión con el servidor", "error");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setMasterKey('');
    setUsername('');
    setPassword('');
    localStorage.removeItem('gmx_user');
    localStorage.removeItem('gmx_pass');
    localStorage.removeItem('gmx_pending_client');
    localStorage.removeItem('gmx_pending_admin');
    localStorage.removeItem('gmx_search_query');
    // We keep the gmx_mk cookie so it persists across sessions on this device
    setView('search');
    addToast("Sesión cerrada", "info");
  };

  const handleSetMasterKey = (key: string) => {
    const trimmedKey = key.trim();
    setMasterKey(trimmedKey);
    const pass = localStorage.getItem('gmx_pass');
    if (pass) {
      saveMasterKeyToCookie(trimmedKey, pass);
      addToast("Llave maestra guardada", "success");
    }
    // Force re-decryption by triggering fetchClients
    fetchClients(true, trimmedKey);
  };

  const fetchClients = async (force = false, currentKey = masterKey) => {
    if (!currentKey) return;

    if (!force) {
      const cached = loadClientsFromCache(currentKey);
      const cacheTime = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (cached && cacheTime) {
        const ageHours = (Date.now() - parseInt(cacheTime)) / (1000 * 60 * 60);
        if (ageHours < 24) {
          setClients(cached);
          return;
        }
      }
    }

    try {
      if (isOffline || !navigator.onLine) {
        throw new Error("Sin conexión");
      }

      const { data, error } = await supabase
        .from('clients')
        .select('*, app_users(username)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const clientsData = data || [];
      setClients(clientsData);
      saveClientsToCache(clientsData, currentKey);
      
      if (force) {
        addToast("Datos sincronizados", "success");
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
      // Fallback to cache on error
      const cached = loadClientsFromCache(currentKey);
      if (cached) {
        setClients(cached);
        if (force) {
          addToast("Mostrando datos en caché (Sin conexión)", "info");
        }
      } else {
        addToast("Error al cargar clientes", "error");
      }
    }
  };

  const fetchAdminUsers = async () => {
    if (user?.role !== 'superadmin') return;
    try {
      const { data, error } = await supabase.from('app_users').select('id, username, email, role, is_active, is_verified, verification_token');
      if (error) throw error;
      if (data) setAdminUsers(data as AppUser[]);
    } catch (err: any) {
      console.error("Error fetching admin users:", err);
      addToast("Error al cargar lista de conductores", "error");
    }
  };

  useEffect(() => {
    if (user && masterKey) {
      fetchClients();
      fetchAdminUsers();
    }
  }, [user, masterKey]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Geolocation error:", err)
      );
    }
  }, []);

  useEffect(() => {
    if (masterKey && clients.length > 0) {
      const decrypted = clients.map(c => {
        const latStr = decrypt(c.encrypted_latitude, masterKey);
        const lngStr = decrypt(c.encrypted_longitude, masterKey);
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        const client: DecryptedClient = {
          id: c.id,
          name: decrypt(c.encrypted_name, masterKey),
          phone: decrypt(c.encrypted_phone, masterKey),
          additional_phones: decrypt(c.additional_phones || '', masterKey),
          address_url: decrypt(c.encrypted_address_url || '', masterKey),
          address_text: decrypt(c.address_text || '', masterKey),
          notes: decrypt(c.encrypted_delivery_notes || '', masterKey),
          rating: decrypt(c.rating || '', masterKey),
          references_text: decrypt(c.references_text || '', masterKey),
          lat,
          lng,
          driver_name: c.app_users?.username || 'Desconocido'
        };

        if (userLocation && !isNaN(lat) && !isNaN(lng)) {
          client.distance = getDistance(userLocation.lat, userLocation.lng, lat, lng);
        }
        return client;
      });
      setDecryptedClients(decrypted);
    } else {
      setDecryptedClients([]);
    }
  }, [clients, masterKey, userLocation]);

  const filteredAndSortedAdminUsers = useMemo(() => {
    return adminUsers
      .filter(u => 
        u.username.toLowerCase().includes(adminSearchQuery.toLowerCase()) || 
        (u.email && u.email.toLowerCase().includes(adminSearchQuery.toLowerCase()))
      )
      .sort((a, b) => {
        if (a.role === 'superadmin' && b.role !== 'superadmin') return -1;
        if (a.role !== 'superadmin' && b.role === 'superadmin') return 1;
        return a.username.localeCompare(b.username);
      });
  }, [adminUsers, adminSearchQuery]);

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const normalizeText = (text: string) => 
      text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
    const query = normalizeText(searchQuery);
    
    return decryptedClients.filter(c => 
      normalizeText(c.name).includes(query) ||
      c.phone.includes(searchQuery) ||
      (c.additional_phones && c.additional_phones.includes(searchQuery))
    ).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [decryptedClients, searchQuery]);

  const driverRanking = useMemo(() => {
    const counts: Record<string, { count: number; name: string }> = {};
    clients.forEach(c => {
      const driverId = c.driver_id;
      const driverName = c.app_users?.username || 'Desconocido';
      if (!counts[driverId]) {
        counts[driverId] = { count: 0, name: driverName };
      }
      counts[driverId].count += 1;
    });
    
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [clients]);

  const handleSecureMyPassword = async () => {
    if (!user) return;
    const pass = localStorage.getItem('gmx_pass');
    if (!pass) {
      addToast("No se encontró la contraseña en la sesión local. Cierra sesión e ingresa de nuevo.", "error");
      return;
    }

    setIsSecuring(true);
    try {
      const encryptedPass = CryptoJS.AES.encrypt(pass, SYSTEM_AUTH_SECRET).toString();
      const { error } = await supabase
        .from('app_users')
        .update({ encrypted_password: encryptedPass })
        .eq('id', user.id);

      if (error) throw error;
      addToast("Contraseña encriptada correctamente", "success");
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsSecuring(false);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'superadmin') return;
    if (isOffline) {
      addToast("No se puede invitar usuarios sin conexión", "error");
      return;
    }
    setIsAdminCreating(true);

    try {
      // Generate a random verification token
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Token expires in 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Create user with email and token, inactive and unverified by default
      // We don't need a password yet, but we can set a dummy one or leave it null if DB allows
      // Assuming DB requires encrypted_password, we set a dummy one
      const dummyPass = CryptoJS.AES.encrypt(token, SYSTEM_AUTH_SECRET).toString();

      const { data, error } = await supabase.from('app_users').insert([{
        username: adminNewEmail.split('@')[0], // Default username from email
        email: adminNewEmail,
        encrypted_password: dummyPass,
        role: 'driver',
        is_active: true, // Active but not verified
        is_verified: false,
        verification_token: token,
        token_expires_at: expiresAt.toISOString()
      }]).select().single();

      if (error) throw error;

      const verificationLink = `https://guiamx.vercel.app/?verify=${token}`;

      // Try to send email
      try {
        const response = await fetch('/api/send-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminNewEmail, link: verificationLink })
        });
        const result = await response.json();
        
        if (result.success) {
          addToast("Conductor invitado exitosamente. Se ha enviado un correo.", "success");
        } else {
          addToast("Usuario creado, pero hubo un error al enviar el correo.", "error");
        }
      } catch (emailErr) {
        console.error("Error calling send-invite:", emailErr);
        addToast("Usuario creado. Configura SMTP para enviar correos.", "info");
      }

      setAdminNewEmail('');
      setAdminNewPassword('');
      localStorage.removeItem('gmx_pending_admin');
      fetchAdminUsers();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setIsAdminCreating(false);
    }
  };

  const handleAdminEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'superadmin' || !editingUser) return;
    if (isOffline) {
      addToast("No se puede editar usuarios sin conexión", "error");
      return;
    }
    setIsEditingUser(true);

    try {
      const updates: any = {};
      if (editUsername !== editingUser.username) updates.username = editUsername;
      if (editEmail !== editingUser.email) updates.email = editEmail;
      
      if (editPassword) {
        updates.encrypted_password = CryptoJS.AES.encrypt(editPassword, SYSTEM_AUTH_SECRET).toString();
      }

      if (Object.keys(updates).length === 0) {
        addToast("No hay cambios para guardar", "info");
        setEditingUser(null);
        return;
      }

      const { error } = await supabase
        .from('app_users')
        .update(updates)
        .eq('id', editingUser.id);

      if (error) throw error;

      addToast("Usuario actualizado correctamente", "success");
      setEditingUser(null);
      setEditPassword('');
      fetchAdminUsers();
    } catch (err: any) {
      addToast(err.message || "Error al actualizar usuario", "error");
    } finally {
      setIsEditingUser(false);
    }
  };

  const handleToggleUserStatus = async (id: string, currentStatus: boolean) => {
    if (user?.role !== 'superadmin') return;
    if (isOffline) {
      addToast("No se puede cambiar el estado de usuario sin conexión", "error");
      return;
    }
    try {
      const { error } = await supabase.from('app_users').update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
      addToast(`Usuario ${!currentStatus ? 'activado' : 'desactivado'}`, "success");
      fetchAdminUsers();
    } catch (err: any) {
      addToast(err.message || "Error al cambiar estado", "error");
    }
  };

  const handleResendInvite = async (email: string, token: string) => {
    if (user?.role !== 'superadmin') return;
    if (isOffline) {
      addToast("No se puede reenviar invitación sin conexión", "error");
      return;
    }
    const verificationLink = `https://guiamx.vercel.app/?verify=${token}`;
    try {
      const response = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, link: verificationLink })
      });
      const result = await response.json();
      if (result.success) {
        addToast("Invitación reenviada exitosamente", "success");
      } else {
        addToast("Error al enviar el correo", "error");
      }
    } catch (err) {
      addToast("Error de conexión al enviar correo", "error");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (user?.role !== 'superadmin') return;
    if (!confirm("¿Eliminar este conductor?")) return;
    try {
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (error) throw error;
      addToast("Conductor eliminado", "success");
      fetchAdminUsers();
    } catch (err: any) {
      addToast(err.message || "Error al eliminar conductor", "error");
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (user?.role !== 'superadmin') return;
    setIsDeletingClient(true);
    try {
      if (isOffline) {
        const queueStr = localStorage.getItem('gmx_offline_queue');
        let queue = queueStr ? JSON.parse(queueStr) : [];
        
        if (id.startsWith('temp_')) {
          // If it's a temp record, just remove it from the queue
          queue = queue.filter((item: any) => item.id !== id);
        } else {
          // Otherwise add a delete action
          queue.push({ action: 'delete', id });
        }
        
        localStorage.setItem('gmx_offline_queue', JSON.stringify(queue));
        
        setClients(prev => {
          const updated = prev.filter(c => c.id !== id);
          saveClientsToCache(updated, masterKey!);
          return updated;
        });

        addToast("Cliente eliminado localmente (Sin conexión)", "info");
      } else {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw error;
        
        setClients(prev => {
          const updated = prev.filter(c => c.id !== id);
          saveClientsToCache(updated, masterKey!);
          return updated;
        });

        addToast("Cliente eliminado permanentemente", "success");
      }
      setClientToDelete(null);
      setSelectedClient(null);
    } catch (err: any) {
      addToast(err.message || "Error al eliminar cliente", "error");
    } finally {
      setIsDeletingClient(false);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterKey || !user) return;

    setIsSaving(true);
    let coords = extractCoordsFromUrl(newClientUrl);
    let autoName = "";

    // If coordinates not found in URL, try server-side expansion
    if (!coords) {
      try {
        const response = await fetch('/api/expand-maps-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newClientUrl })
        });
        
        if (response.ok) {
          const data = await response.json();
          coords = { lat: data.lat, lng: data.lng };
          autoName = data.name || "";
        }
      } catch (err) {
        console.error("Error expanding URL:", err);
      }
    }

    if (!coords) {
      addToast('No se pudieron extraer coordenadas, pero el registro se guardará.', "success");
      coords = { lat: NaN, lng: NaN };
    }

    const finalName = newClientName || autoName || "Cliente sin nombre";
    const formattedPhone = formatPhone(newClientPhone);
    const formattedAdditionalPhones = additionalPhoneTags.map(formatPhone).filter(Boolean).join(', ');

    try {
      const clientData = {
        encrypted_name: encrypt(finalName, masterKey),
        encrypted_phone: encrypt(formattedPhone, masterKey),
        additional_phones: encrypt(formattedAdditionalPhones, masterKey),
        encrypted_latitude: encrypt(coords.lat.toString(), masterKey),
        encrypted_longitude: encrypt(coords.lng.toString(), masterKey),
        encrypted_address_url: encrypt(newClientUrl, masterKey),
        address_text: encrypt(newClientAddressText, masterKey),
        encrypted_delivery_notes: encrypt(newClientNotes, masterKey),
        rating: encrypt(newClientRating.toString(), masterKey),
        references_text: encrypt(newClientReferences, masterKey),
      };

      if (isOffline) {
        // Save to offline queue
        const queueStr = localStorage.getItem('gmx_offline_queue');
        let queue = queueStr ? JSON.parse(queueStr) : [];
        
        const offlineId = editingClient ? editingClient.id : `temp_${Date.now()}`;
        
        if (editingClient && offlineId.startsWith('temp_')) {
          // If editing a temp record, just update its data in the queue
          const existingIndex = queue.findIndex((item: any) => item.id === offlineId && item.action === 'insert');
          if (existingIndex !== -1) {
            queue[existingIndex].data = { ...queue[existingIndex].data, ...clientData };
          } else {
            // Fallback if not found
            queue.push({ action: 'insert', id: offlineId, data: clientData });
          }
        } else {
          queue.push({
            action: editingClient ? 'update' : 'insert',
            id: offlineId,
            data: clientData
          });
        }
        
        localStorage.setItem('gmx_offline_queue', JSON.stringify(queue));

        // Update local state optimistically
        const newClientData = {
          id: offlineId,
          driver_id: user.id,
          created_at: new Date().toISOString(),
          app_users: { username: user.username },
          ...clientData
        };

        setClients(prev => {
          let updated;
          if (editingClient) {
            updated = prev.map(c => c.id === editingClient.id ? newClientData as any : c);
          } else {
            updated = [newClientData as any, ...prev];
          }
          saveClientsToCache(updated, masterKey);
          return updated;
        });

        addToast(editingClient ? "Cliente actualizado localmente (Sin conexión)" : "Cliente guardado localmente (Sin conexión)", "info");
      } else {
        let error, newClientData;
        if (editingClient) {
          const { data, error: updateError } = await supabase
            .from('clients')
            .update(clientData)
            .eq('id', editingClient.id)
            .select('*, app_users(username)')
            .single();
          error = updateError;
          newClientData = data;
        } else {
          const { data, error: insertError } = await supabase
            .from('clients')
            .insert({
              driver_id: user.id,
              ...clientData
            })
            .select('*, app_users(username)')
            .single();
          error = insertError;
          newClientData = data;
        }

        if (error) throw error;

        if (newClientData) {
          setClients(prev => {
            let updated;
            if (editingClient) {
              updated = prev.map(c => c.id === newClientData.id ? newClientData : c);
            } else {
              updated = [newClientData, ...prev];
            }
            saveClientsToCache(updated, masterKey);
            return updated;
          });
        }

        addToast(editingClient ? "Cliente actualizado correctamente" : "Cliente registrado correctamente", "success");
      }

      setIsAdding(false);
      setEditingClient(null);
      setNewClientUrl('');
      setNewClientName('');
      setNewClientPhone('');
      setAdditionalPhoneTags([]);
      setNewClientAdditionalPhoneInput('');
      setNewClientAddressText('');
      setNewClientNotes('');
      setNewClientReferences('');
      setNewClientRating(0);
      localStorage.removeItem('gmx_pending_client');
      
      // Update selected client if it was the one being edited
      if (editingClient && selectedClient && selectedClient.id === editingClient.id) {
        setSelectedClient({
          ...selectedClient,
          name: finalName,
          phone: formattedPhone,
          additional_phones: formattedAdditionalPhones,
          lat: coords.lat,
          lng: coords.lng,
          address_url: newClientUrl,
          address_text: newClientAddressText,
          notes: newClientNotes,
          rating: newClientRating.toString(),
          references_text: newClientReferences
        });
      }
    } catch (err: any) {
      if (err.message && err.message.includes('foreign key constraint')) {
        addToast("Error de sesión: Por favor cierra sesión y vuelve a entrar para actualizar tu acceso.", "error");
      } else {
        addToast(err.message || (editingClient ? "Error al actualizar cliente" : "Error al registrar cliente"), "error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (client: DecryptedClient) => {
    setEditingClient(client);
    setNewClientUrl(client.address_url);
    setNewClientName(client.name);
    setNewClientPhone(client.phone);
    setAdditionalPhoneTags(client.additional_phones ? client.additional_phones.split(',').map(p => p.trim()).filter(Boolean) : []);
    setNewClientAddressText(client.address_text || '');
    setNewClientNotes(client.notes || '');
    setNewClientReferences(client.references_text || '');
    setNewClientRating(client.rating ? parseInt(client.rating) : 0);
    setIsAdding(true);
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white p-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Loader2 className="h-10 w-10 text-blue-600" />
        </motion.div>
        {authError && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 max-w-md text-center"
          >
            <div className="rounded-2xl bg-red-50 p-4 text-red-600 ring-1 ring-red-100">
              <p className="font-bold">Error de Conexión</p>
              <p className="text-sm mt-1">{authError}</p>
              <p className="text-xs mt-4 text-red-400">
                Asegúrate de haber configurado las variables <code className="bg-red-100 px-1 rounded">VITE_SUPABASE_URL</code> y <code className="bg-red-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> en los Secretos de AI Studio.
              </p>
            </div>
            <button 
              onClick={() => {
                setAuthError(null);
                setIsAuthLoading(true);
                window.location.reload();
              }}
              className="mt-4 text-sm font-bold text-blue-600 hover:underline"
            >
              Reintentar
            </button>
          </motion.div>
        )}
      </div>
    );
  }

  const renderToasts = () => (
    <div className="fixed top-6 left-4 right-4 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`pointer-events-auto flex items-center justify-between gap-4 rounded-2xl px-6 py-4 shadow-2xl ring-1 w-full max-w-2xl border border-white/10 backdrop-blur-md ${
              toast.type === 'success' ? 'bg-emerald-600/95 text-white ring-emerald-400' :
              toast.type === 'error' ? 'bg-red-600/95 text-white ring-red-400' :
              'bg-walmart-blue/95 text-white ring-blue-400'
            }`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {toast.type === 'error' && <AlertCircle size={20} className="shrink-0" />}
              <span className="text-sm md:text-base font-bold leading-tight break-words">{toast.message}</span>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-2 rounded-full p-1.5 hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setVerificationError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 6) {
      setVerificationError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setIsVerifying(true);
    try {
      const encryptedPass = CryptoJS.AES.encrypt(newPassword, SYSTEM_AUTH_SECRET).toString();
      
      const { error } = await supabase
        .from('app_users')
        .update({
          encrypted_password: encryptedPass,
          is_verified: true,
          verification_token: null,
          token_expires_at: null
        })
        .eq('id', verifiedUser?.id);

      if (error) throw error;
      
      addToast("Cuenta verificada y contraseña establecida. Ahora puedes iniciar sesión.", "success");
      setVerificationToken(null);
      setVerifiedUser(null);
      // Remove token from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setVerificationError("Error al establecer la contraseña.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (verificationToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="mb-8 flex justify-center">
            <div className="rounded-2xl bg-blue-600 p-4 shadow-lg">
              <Navigation className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">Verificación de Cuenta</h1>
          
          {verificationError ? (
            <div className="text-center">
              <div className="rounded-2xl bg-red-50 p-4 text-red-600 ring-1 ring-red-100 dark:bg-red-900/20 dark:ring-red-500/30">
                <p className="font-medium">{verificationError}</p>
              </div>
              <button 
                onClick={() => {
                  setVerificationToken(null);
                  window.history.replaceState({}, document.title, window.location.pathname);
                }}
                className="mt-6 w-full rounded-xl bg-gray-100 py-3 font-bold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : verifiedUser ? (
            <form onSubmit={handleSetPassword} className="space-y-6">
              <p className="text-center text-gray-600 dark:text-gray-400">
                Hola <strong>{verifiedUser.email}</strong>, establece tu contraseña para activar tu cuenta.
              </p>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nueva Contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border-0 bg-gray-50 px-4 py-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 dark:bg-gray-900 dark:text-white dark:ring-gray-700"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirmar Contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border-0 bg-gray-50 px-4 py-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 dark:bg-gray-900 dark:text-white dark:ring-gray-700"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-70"
              >
                {isVerifying ? 'Guardando...' : 'Establecer Contraseña'}
              </button>
            </form>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}
        </div>
        {renderToasts()}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 transition-colors duration-300">
        {renderToasts()}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-2xl shadow-blue-100/50 dark:shadow-none ring-1 ring-slate-100 dark:ring-slate-800"
        >
          <div className="text-center">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-walmart-blue text-white shadow-lg shadow-walmart-blue/20"
            >
              <Navigation className="h-10 w-10" />
            </motion.div>
            <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-900 dark:text-white">GuíaMX</h2>
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">Logística de precisión para drivers</p>
          </div>
          <form className="mt-8 space-y-4" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="block w-full rounded-2xl border-0 py-4 pl-12 text-slate-900 dark:text-white bg-white dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-walmart-blue transition-all"
                  placeholder="Usuario o correo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="block w-full rounded-2xl border-0 py-4 pl-12 pr-12 text-slate-900 dark:text-white bg-white dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-walmart-blue transition-all"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button
              disabled={isLoggingIn}
              type="submit"
              className="w-full rounded-2xl bg-walmart-blue py-4 text-sm font-bold text-white shadow-xl shadow-walmart-blue/20 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-70"
            >
              {isLoggingIn ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Iniciar Sesión'}
            </button>
          </form>
          <div className="flex justify-center gap-2 pt-4">
            <button 
              onClick={() => setThemePreference('light')}
              className={`p-2 rounded-full transition-colors ${themePreference === 'light' ? 'bg-walmart-blue text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="Modo Claro"
            >
              <Sun size={18} />
            </button>
            <button 
              onClick={() => setThemePreference('system')}
              className={`p-2 rounded-full transition-colors ${themePreference === 'system' ? 'bg-walmart-blue text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="Sistema"
            >
              <Monitor size={18} />
            </button>
            <button 
              onClick={() => setThemePreference('dark')}
              className={`p-2 rounded-full transition-colors ${themePreference === 'dark' ? 'bg-walmart-blue text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="Modo Oscuro"
            >
              <Moon size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!masterKey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        {renderToasts()}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-8 rounded-3xl bg-white p-8 shadow-2xl shadow-yellow-100/50"
        >
          <div className="text-center">
            <motion.div 
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-yellow-500 text-white shadow-lg shadow-yellow-200"
            >
              <ShieldCheck className="h-10 w-10" />
            </motion.div>
            <h2 className="mt-6 text-3xl font-black text-slate-900">Master Key</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Tus datos están cifrados. Ingresa tu llave maestra para desbloquearlos.
            </p>
          </div>
          <div className="mt-8 space-y-4">
            <div className="relative">
              <input
                type={showMasterKey ? "text" : "password"}
                className="block w-full rounded-2xl border-0 py-4 pl-4 pr-12 text-center text-2xl tracking-widest text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-walmart-blue transition-all"
                placeholder="••••••"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetMasterKey((e.target as HTMLInputElement).value);
                }}
              />
              <button
                type="button"
                onClick={() => setShowMasterKey(!showMasterKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showMasterKey ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
            <button
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling?.querySelector('input') as HTMLInputElement;
                if (input) handleSetMasterKey(input.value);
              }}
              className="w-full rounded-2xl bg-walmart-blue py-4 font-bold text-white shadow-xl shadow-walmart-blue/20 hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              Desbloquear
            </button>
            <button 
              onClick={handleLogout}
              className="w-full text-sm font-bold text-slate-400 hover:text-slate-600"
            >
              Cerrar Sesión
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-950 transition-colors duration-300">
      {renderToasts()}
      {/* Header - Walmart Style */}
      <header className="flex items-center justify-between bg-walmart-blue px-6 py-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-walmart-blue shadow-sm">
            <Navigation className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            GuíaMX
            {isOffline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-100 ring-1 ring-red-500/50">
                <WifiOff className="h-3 w-3" />
                Sin conexión
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-1 relative">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-white/20 text-white px-3 font-bold hover:bg-white/30 transition-all mr-1"
              title="Instalar App"
            >
              <Download className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Instalar</span>
            </button>
          )}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${isMenuOpen ? 'bg-white/20 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            title="Menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 mt-2 w-56 origin-top-right rounded-2xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-black/5 dark:ring-white/10 z-50 overflow-hidden"
                >
                  <div className="p-2 space-y-1">
                    {user && (
                      <>
                        <div className="px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-200">
                          Hola, {user.username.charAt(0).toUpperCase() + user.username.slice(1)}
                        </div>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      </>
                    )}
                    <button
                      onClick={() => {
                        setView('search');
                        setIsMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${view === 'search' ? 'bg-blue-50 text-walmart-blue dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      <Search className="h-4 w-4" />
                      Página Principal
                    </button>
                    <button
                      onClick={() => {
                        fetchClients(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sincronizar Datos
                    </button>
                    <button
                      onClick={() => {
                        setView('ranking');
                        setIsMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${view === 'ranking' ? 'bg-blue-50 text-walmart-blue dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      <Trophy className="h-4 w-4" />
                      Ranking
                    </button>
                    <button
                      onClick={() => {
                        setView('settings');
                        setIsMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${view === 'settings' ? 'bg-blue-50 text-walmart-blue dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      <Settings className="h-4 w-4" />
                      Ajustes
                    </button>
                    {user?.role === 'superadmin' && (
                      <button
                        onClick={() => {
                          setView('admin');
                          setIsMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${view === 'admin' ? 'bg-blue-50 text-walmart-blue dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Administración
                      </button>
                    )}
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar Sesión
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex-1 overflow-y-auto px-6 pb-24">
        <AnimatePresence mode="wait">
          {view === 'search' ? (
            <motion.div 
              key="search-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-auto max-w-2xl pt-8"
            >
              {/* Walmart-style Search Bar */}
              <div className="mb-8">
                <div className="relative flex items-center rounded-full bg-white dark:bg-slate-900 px-1.5 py-1 shadow-md ring-1 ring-slate-200 dark:ring-slate-800 focus-within:ring-2 focus-within:ring-walmart-blue transition-all">
                  <input
                    type="text"
                    placeholder="Busca un cliente, teléfono o dirección..."
                    className="flex-1 border-0 bg-transparent px-4 py-1.5 text-base text-slate-900 dark:text-white focus:ring-0 placeholder:text-slate-400"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <X className="h-5 w-5" />
                      </button>
                    )}
                    <button className="flex h-9 w-9 items-center justify-center rounded-full bg-walmart-yellow text-walmart-blue shadow-sm hover:bg-yellow-400 transition-colors">
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Results */}
              <div className="space-y-4">
                <AnimatePresence>
                  {filteredClients.map((client, idx) => (
                    <motion.div
                      layout
                      key={client.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => setSelectedClient(client)}
                      className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800 hover:shadow-md hover:ring-walmart-blue/30 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-walmart-blue/10 dark:bg-walmart-blue/20 text-walmart-blue">
                              <User className="h-3.5 w-3.5" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{client.name}</h3>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                              {formatPhone(client.phone)}
                            </div>
                            {client.additional_phones && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                {client.additional_phones.split(',').map(p => formatPhone(p)).join(', ')}
                              </div>
                            )}
                            {client.rating && (
                              <div className="flex items-center gap-1 text-yellow-500">
                                {Array.from({ length: parseInt(client.rating) }).map((_, i) => (
                                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                                ))}
                              </div>
                            )}
                            {client.distance !== undefined && (
                              <div className="flex items-center gap-1.5 text-walmart-blue dark:text-blue-400">
                                <MapPin className="h-3.5 w-3.5" />
                                A {client.distance.toFixed(2)} km
                              </div>
                            )}
                          </div>
                          {client.address_text && (
                            <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                              📍 {client.address_text}
                            </p>
                          )}
                          {client.references_text && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-bold">Ref:</span> {client.references_text}
                            </p>
                          )}
                          {client.notes && (
                            <p className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2 text-xs text-slate-600 dark:text-slate-400 italic">
                              "{client.notes}"
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <a 
                            href={client.address_url || `https://www.google.com/maps/dir/?api=1&destination=${client.lat},${client.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-walmart-blue text-white shadow-md hover:bg-blue-700 active:scale-90 transition-all"
                          >
                            <Navigation className="h-5 w-5" />
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {searchQuery && filteredClients.length === 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-12 text-center"
                  >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                      <Search className="h-8 w-8" />
                    </div>
                    <p className="text-slate-400 font-medium">No se encontraron resultados para "{searchQuery}"</p>
                  </motion.div>
                )}

                {!searchQuery && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-24 text-center"
                  >
                    <p className="text-slate-300 font-bold text-xl">Escribe algo para empezar a buscar</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : view === 'admin' ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mx-auto max-w-2xl pt-8"
            >
              {/* Diagnostic Info */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 mb-6 shadow-sm">
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Diagnóstico de Sesión</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Tu ID de Usuario</span>
                    <div className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all select-all">{user?.id}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Tu Rol Actual</span>
                    <div className="text-xs font-bold text-walmart-blue dark:text-blue-400 uppercase">{user?.role}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-slate-100 dark:ring-slate-800">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-walmart-blue text-white">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-900 dark:text-white">Gestión de Usuarios</h2>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Agregar conductores</p>
                    </div>
                  </div>
                  
                  <form onSubmit={handleAdminCreateUser} className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Correo Electrónico</label>
                        <input
                          type="email"
                          required
                          className="w-full rounded-xl border-0 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                          placeholder="ej: conductor@empresa.com"
                          value={adminNewEmail}
                          onChange={(e) => setAdminNewEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      disabled={isAdminCreating}
                      type="submit"
                      className="w-full rounded-xl bg-walmart-blue py-3 font-bold text-white shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                    >
                      {isAdminCreating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : <><Plus className="h-4 w-4" /> INVITAR CONDUCTOR</>}
                    </button>
                  </form>
                </div>

                <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-slate-100 dark:ring-slate-800">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 text-center">Mi Cuenta</h3>
                  <button 
                    disabled={isSecuring}
                    onClick={handleSecureMyPassword}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-white shadow-lg hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {isSecuring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {isSecuring ? 'PROCESANDO...' : 'ENCRIPTAR MI CONTRASEÑA'}
                  </button>
                  <p className="mt-3 text-[10px] text-center text-slate-400 dark:text-slate-500 font-medium">
                    Usa este botón si tu contraseña está en texto plano en la base de datos.
                  </p>
                </div>

                <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-slate-100 dark:ring-slate-800 md:col-span-2">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Conductores Registrados</h3>
                    <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-xs font-bold text-walmart-blue dark:text-blue-400">
                      {adminUsers.length} Total
                    </span>
                  </div>

                  <div className="mb-4 relative flex items-center rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 ring-1 ring-slate-200 dark:ring-slate-700 focus-within:ring-2 focus-within:ring-walmart-blue transition-all">
                    <Search className="h-4 w-4 text-slate-400 mr-2" />
                    <input
                      type="text"
                      placeholder="Buscar conductor..."
                      className="flex-1 border-0 bg-transparent p-0 text-sm text-slate-900 dark:text-white focus:ring-0 placeholder:text-slate-400"
                      value={adminSearchQuery}
                      onChange={(e) => setAdminSearchQuery(e.target.value)}
                    />
                    {adminSearchQuery && (
                      <button onClick={() => setAdminSearchQuery('')} className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {filteredAndSortedAdminUsers.map(u => (
                      <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-100 dark:ring-slate-800 transition-all hover:ring-blue-200 dark:hover:ring-blue-800/50">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${u.role === 'superadmin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-walmart-blue dark:bg-blue-900/30 dark:text-blue-400'}`}>
                            {u.role === 'superadmin' ? <ShieldCheck className="h-5 w-5" /> : <User className="h-5 w-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{u.username}</p>
                              {u.role === 'superadmin' && (
                                <span className="rounded bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">Admin</span>
                              )}
                              {!u.is_active && (
                                <span className="rounded bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">Inactivo</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{u.email || 'Sin correo'}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${u.is_verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {u.is_verified ? '✓ Verificado' : '⏳ Pendiente'}
                              </span>
                              {!u.is_verified && u.verification_token && (
                                <button 
                                  onClick={() => handleResendInvite(u.email || '', u.verification_token || '')}
                                  className="text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  Reenviar Invitación
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto">
                          <button
                            onClick={() => {
                              setEditingUser(u);
                              setEditUsername(u.username);
                              setEditEmail(u.email || '');
                              setEditPassword('');
                            }}
                            className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                            title="Editar usuario"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {u.id !== user?.id && (
                            <>
                              <button
                                onClick={() => handleToggleUserStatus(u.id, u.is_active ?? true)}
                                className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${u.is_active ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'}`}
                              >
                                {u.is_active ? 'Desactivar' : 'Activar'}
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {adminUsers.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
                        No hay usuarios registrados
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === 'ranking' ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mx-auto max-w-2xl pt-8"
            >
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-slate-100 dark:ring-slate-800">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-walmart-yellow text-walmart-blue">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Ranking de Conductores</h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Top 5 conductores con más clientes agregados</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {driverRanking.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">Aún no hay clientes registrados.</p>
                  ) : (
                    driverRanking.map((driver, index) => (
                      <div 
                        key={index}
                        className={`flex items-center justify-between p-4 rounded-2xl border ${
                          index === 0 ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-900/30' :
                          index === 1 ? 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700' :
                          index === 2 ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30' :
                          'bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full font-black text-lg ${
                            index === 0 ? 'bg-yellow-400 text-yellow-900' :
                            index === 1 ? 'bg-slate-300 text-slate-800' :
                            index === 2 ? 'bg-orange-300 text-orange-900' :
                            'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            #{index + 1}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{driver.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {index === 0 ? '🏆 Líder actual' : index < 3 ? '⭐ En el podio' : 'Conductor destacado'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-walmart-blue dark:text-blue-400">{driver.count}</p>
                          <p className="text-[10px] uppercase font-bold text-slate-400">Clientes</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mx-auto max-w-2xl pt-8"
            >
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-slate-100 dark:ring-slate-800">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-walmart-blue text-white">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Configuración</h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Ajustes de seguridad y cuenta</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <Moon className="h-4 w-4 text-walmart-blue" />
                      Apariencia
                    </h3>
                    <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      <button 
                        onClick={() => setThemePreference('light')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${themePreference === 'light' ? 'bg-walmart-blue text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'}`}
                      >
                        <Sun className="h-4 w-4" />
                        Claro
                      </button>
                      <button 
                        onClick={() => setThemePreference('system')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${themePreference === 'system' ? 'bg-walmart-blue text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'}`}
                      >
                        <Monitor className="h-4 w-4" />
                        Sistema
                      </button>
                      <button 
                        onClick={() => setThemePreference('dark')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${themePreference === 'dark' ? 'bg-walmart-blue text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'}`}
                      >
                        <Moon className="h-4 w-4" />
                        Oscuro
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                      <Key className="h-4 w-4 text-walmart-blue" />
                      Estado de la Llave Maestra
                    </h3>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-slate-500 dark:text-slate-400">¿Llave guardada en este dispositivo?</span>
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${masterKey ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {masterKey ? 'SÍ, GUARDADA' : 'NO GUARDADA'}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Si tienes problemas de descifrado (ej. ves [Error de decifrado]), puedes reingresar tu llave maestra aquí.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showMasterKey ? "text" : "password"}
                            placeholder="Ingresa la llave maestra"
                            className="w-full rounded-xl border-0 py-2.5 pl-4 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSetMasterKey((e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowMasterKey(!showMasterKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            {showMasterKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <button
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling?.querySelector('input') as HTMLInputElement;
                            if (input && input.value) {
                              handleSetMasterKey(input.value);
                              input.value = '';
                            }
                          }}
                          className="rounded-xl bg-walmart-blue py-2.5 px-4 font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.98] transition-all text-sm whitespace-nowrap"
                        >
                          Actualizar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Action Button - Walmart Yellow */}
      <AnimatePresence>
        {view === 'search' && (
          <motion.button 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setEditingClient(null);
              setNewClientUrl('');
              setNewClientName('');
              setNewClientPhone('');
              setAdditionalPhoneTags([]);
              setNewClientAddressText('');
              setNewClientNotes('');
              setNewClientReferences('');
              setNewClientRating(0);
              setIsAdding(true);
            }}
            className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-walmart-yellow text-walmart-blue shadow-2xl z-40"
          >
            <Plus className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Client Detail Modal */}
      <AnimatePresence>
        {selectedClient && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            onClick={() => setSelectedClient(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Background */}
              <div className="bg-walmart-blue p-6 text-white relative">
                <button 
                  onClick={() => setSelectedClient(null)}
                  className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 text-walmart-blue shadow-lg">
                    <User size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-black leading-tight truncate">{selectedClient.name}</h2>
                    <div className="mt-1 flex items-center gap-2 text-blue-100">
                      <div className="flex">
                        {selectedClient.rating && Array.from({ length: 5 }).map((_, i) => (
                          <Star 
                            key={i} 
                            size={14} 
                            className={`${i < parseInt(selectedClient.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-blue-300/50'}`} 
                          />
                        ))}
                      </div>
                      {selectedClient.distance !== undefined && (
                        <span className="text-xs font-bold whitespace-nowrap">• A {selectedClient.distance.toFixed(2)} km</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
                {/* Contact Section */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Contacto</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <a 
                      href={`tel:${formatPhone(selectedClient.phone)}`}
                      className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-100 dark:hover:border-blue-800 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-walmart-blue dark:text-blue-400">
                          <Phone size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Principal</p>
                          <p className="text-base font-black text-slate-900 dark:text-white">{formatPhone(selectedClient.phone)}</p>
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-walmart-blue text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Phone size={14} fill="currentColor" />
                      </div>
                    </a>

                    {selectedClient.additional_phones && selectedClient.additional_phones.split(',').map((phone, i) => (
                      <a 
                        key={i}
                        href={`tel:${formatPhone(phone)}`}
                        className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-100 dark:hover:border-blue-800 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-slate-400 dark:text-slate-500">
                            <Phone size={18} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Adicional {i + 1}</p>
                            <p className="text-base font-black text-slate-900 dark:text-white">{formatPhone(phone)}</p>
                          </div>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-slate-400 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Phone size={14} fill="currentColor" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Location Section */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ubicación</h3>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-4">
                    {selectedClient.address_text && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Dirección</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">{selectedClient.address_text}</p>
                      </div>
                    )}
                    {selectedClient.references_text && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Referencias</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{selectedClient.references_text}</p>
                      </div>
                    )}
                    <div className="pt-2">
                      <motion.a 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        href={selectedClient.address_url || `https://www.google.com/maps/dir/?api=1&destination=${selectedClient.lat},${selectedClient.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-black text-white shadow-md hover:bg-blue-700 transition-colors"
                      >
                        <Navigation size={18} />
                        INICIAR NAVEGACIÓN
                      </motion.a>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                {selectedClient.notes && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Notas de Entrega</h3>
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-900/30">
                      <p className="text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">
                        "{selectedClient.notes}"
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Added by info */}
                {selectedClient.driver_name && (
                  <div className="pt-2 pb-1 text-center">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Agregado por: <span className="font-bold">{selectedClient.driver_name}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                <button 
                  onClick={() => {
                    const shareText = `*Cliente:* ${selectedClient.name}
*Teléfono:* ${formatPhone(selectedClient.phone)}
${selectedClient.additional_phones ? `*Teléfonos adicionales:* ${selectedClient.additional_phones.split(',').map(p => formatPhone(p)).join(', ')}\n` : ''}
*Dirección:*
${selectedClient.address_text || 'No especificada'}

*Ubicación en Mapa:*
${selectedClient.address_url || `https://www.google.com/maps/dir/?api=1&destination=${selectedClient.lat},${selectedClient.lng}`}

*Referencias:*
${selectedClient.references_text || 'No especificadas'}

*Notas de entrega:*
${selectedClient.delivery_notes || 'No especificadas'}

*Calificación:* ${selectedClient.rating ? `${selectedClient.rating} estrellas` : 'Sin calificación'}`;

                    const shareData = {
                      title: `Información de ${selectedClient.name}`,
                      text: shareText,
                    };
                    if (navigator.share) {
                      navigator.share(shareData).catch((e) => {
                        if (e.name !== 'AbortError') {
                          console.error('Error sharing:', e);
                          addToast("Error al compartir", "error");
                        }
                      });
                    } else {
                      navigator.clipboard.writeText(shareData.text);
                      addToast("Información copiada al portapapeles", "success");
                    }
                  }}
                  className="flex-1 py-2 rounded-xl text-sm font-bold bg-walmart-blue text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} />
                  Compartir
                </button>
                {user?.role === 'superadmin' && (
                  <>
                    <button 
                      onClick={() => {
                        setSelectedClient(null);
                        openEditModal(selectedClient);
                      }}
                      className="flex-1 py-2 rounded-xl text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit2 size={16} />
                      Editar
                    </button>
                    <button 
                      onClick={() => setClientToDelete(selectedClient.id)}
                      className="flex-1 py-2 rounded-xl text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {clientToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
            onClick={() => setClientToDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">¿Eliminar cliente?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Esta acción es permanente y no se puede deshacer. Se borrará el registro de la base de datos.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setClientToDelete(null)}
                  disabled={isDeletingClient}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteClient(clientToDelete)}
                  disabled={isDeletingClient}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeletingClient ? <Loader2 size={18} className="animate-spin" /> : 'Eliminar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Client Modal */}
      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:items-center"
          >
            <motion.div 
              initial={{ y: "100%", scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: "100%", scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white">{editingClient ? 'Editar Registro' : 'Nuevo Registro'}</h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{editingClient ? 'Modifica los datos del cliente' : 'Registra un nuevo punto de destino'}</p>
                </div>
                <button onClick={() => { setIsAdding(false); setEditingClient(null); }} className="rounded-full bg-slate-100 dark:bg-slate-800 p-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleAddClient} className="space-y-3">
                <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Link de Google Maps</label>
                    <p className="mb-1 text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-tighter">* Obligatorio: Pega el enlace compartido desde Maps</p>
                    <input
                      required
                      type="url"
                      placeholder="https://maps.app.goo.gl/..."
                      className="w-full rounded-xl border-0 py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                      value={newClientUrl}
                      onChange={(e) => setNewClientUrl(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Nombre y Apellidos</label>
                      <input
                        type="text"
                        placeholder="Ej: Juan Pérez"
                        className="w-full rounded-xl border-0 py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Celular Principal</label>
                      <p className="mb-1 text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-tighter">* Obligatorio</p>
                      <input
                        required
                        type="tel"
                        placeholder="10 dígitos"
                        className="w-full rounded-xl border-0 py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Números Adicionales</label>
                      <p className="mb-1 text-[9px] font-medium text-slate-400 dark:text-slate-500 italic">Escribe un número y presiona coma (,) para agregarlo</p>
                      <div className="w-full rounded-xl bg-white dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus-within:ring-2 focus-within:ring-walmart-blue transition-all p-2 flex flex-wrap gap-2">
                        {additionalPhoneTags.map((tag, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-walmart-blue dark:text-blue-400 text-xs font-bold">
                            {tag}
                            <button 
                              type="button" 
                              onClick={() => setAdditionalPhoneTags(prev => prev.filter((_, i) => i !== idx))}
                              className="hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          type="tel"
                          placeholder={additionalPhoneTags.length === 0 ? "Ej: 5512345678," : ""}
                          className="flex-1 min-w-[120px] border-0 bg-transparent p-0 text-sm text-slate-900 dark:text-white focus:ring-0"
                          value={newClientAdditionalPhoneInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.endsWith(',')) {
                              const newTag = val.slice(0, -1).trim();
                              if (newTag) {
                                setAdditionalPhoneTags(prev => [...prev, newTag]);
                                setNewClientAdditionalPhoneInput('');
                              }
                            } else {
                              setNewClientAdditionalPhoneInput(val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const newTag = newClientAdditionalPhoneInput.trim();
                              if (newTag) {
                                setAdditionalPhoneTags(prev => [...prev, newTag]);
                                setNewClientAdditionalPhoneInput('');
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Dirección en Texto</label>
                      <input
                        type="text"
                        placeholder="Calle, Número, Colonia"
                        className="w-full rounded-xl border-0 py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                        value={newClientAddressText}
                        onChange={(e) => setNewClientAddressText(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Referencias del Domicilio</label>
                    <p className="mb-1 text-[9px] font-medium text-slate-400 dark:text-slate-500 italic">Ej: Portón negro, frente a parque</p>
                    <input
                      type="text"
                      placeholder="Descripción visual del lugar"
                      className="w-full rounded-xl border-0 py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                      value={newClientReferences}
                      onChange={(e) => setNewClientReferences(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Calificación del Cliente</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <motion.button
                          key={star}
                          type="button"
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.8 }}
                          animate={newClientRating >= star ? { scale: [1, 1.2, 1], rotate: [0, 15, 0] } : {}}
                          transition={{ duration: 0.3 }}
                          onClick={() => setNewClientRating(star)}
                          className={`p-1 transition-colors ${newClientRating >= star ? 'text-yellow-500' : 'text-slate-200 dark:text-slate-700'}`}
                        >
                          <Star className={`h-6 w-6 ${newClientRating >= star ? 'fill-current' : ''}`} />
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Notas de Entrega</label>
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border-0 py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all text-sm"
                      value={newClientNotes}
                      onChange={(e) => setNewClientNotes(e.target.value)}
                    />
                  </div>
                </div>
                
                <button
                  disabled={isSaving}
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-walmart-blue py-3.5 font-black text-white shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 text-sm"
                >
                  {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : (editingClient ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />)}
                  {editingClient ? 'ACTUALIZAR REGISTRO' : 'GUARDAR REGISTRO'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {isEditingUser && editingUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">Editar Usuario</h2>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Modifica la información del conductor</p>
                </div>
                <button 
                  onClick={() => { setIsEditingUser(false); setEditingUser(null); }} 
                  className="rounded-full bg-slate-100 dark:bg-slate-800 p-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAdminEditUser} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Nombre de Usuario</label>
                    <input
                      type="text"
                      required
                      className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Nueva Contraseña (Opcional)</label>
                    <input
                      type="password"
                      placeholder="Dejar en blanco para no cambiar"
                      className="block w-full rounded-xl border-0 py-3 px-4 text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-walmart-blue transition-all"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setIsEditingUser(false); setEditingUser(null); }}
                    className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-xl bg-walmart-blue px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toaster System */}
    </div>
  );
}
