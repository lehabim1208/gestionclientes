export interface Client {
  id: string;
  driver_id: string;
  encrypted_name: string;
  encrypted_phone: string;
  additional_phones?: string;
  encrypted_latitude: string;
  encrypted_longitude: string;
  encrypted_address_url: string;
  address_text?: string;
  encrypted_delivery_notes?: string;
  rating?: string;
  references_text?: string;
  created_at: string;
  app_users?: {
    username: string;
  };
}

export interface DecryptedClient {
  id: string;
  name: string;
  phone: string;
  additional_phones?: string;
  address_url: string;
  address_text?: string;
  notes: string;
  rating?: string;
  references_text?: string;
  lat: number;
  lng: number;
  distance?: number;
  driver_name?: string;
}

export interface AppUser {
  id: string;
  username: string;
  email?: string;
  role: 'driver' | 'superadmin';
  is_active?: boolean;
  is_verified?: boolean;
  verification_token?: string;
  token_expires_at?: string;
}
