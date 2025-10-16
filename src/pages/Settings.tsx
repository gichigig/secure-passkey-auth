import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Shield, ArrowLeft, Key, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [twoFAEnabled, setTwoFAEnabled] = useState(true);
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyName, setPasskeyName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    const { data: twoFAData } = await supabase
      .from('user_2fa')
      .select('enabled')
      .eq('user_id', user.id)
      .single();

    if (twoFAData) {
      setTwoFAEnabled(twoFAData.enabled);
    }

    const { data: passkeyData } = await supabase
      .from('user_passkeys')
      .select('*')
      .eq('user_id', user.id);

    if (passkeyData) {
      setPasskeys(passkeyData);
    }
  };

  const toggleTwoFA = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from('user_2fa')
        .update({ enabled: !twoFAEnabled })
        .eq('user_id', user.id);

      if (error) throw error;

      setTwoFAEnabled(!twoFAEnabled);
      toast.success(`2FA ${!twoFAEnabled ? 'enabled' : 'disabled'}`);
    } catch (error: any) {
      toast.error('Failed to update 2FA settings');
    } finally {
      setLoading(false);
    }
  };

  const addPasskey = async () => {
    if (!user || !passkeyName.trim()) {
      toast.error('Please enter a device name');
      return;
    }

    setLoading(true);
    try {
      // Create WebAuthn credential
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'Secure Auth App',
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email || '',
          displayName: user.email || '',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: 'none',
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      // Store the credential in the database
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      const response = credential.response as AuthenticatorAttestationResponse;
      const publicKey = btoa(String.fromCharCode(...new Uint8Array(response.getPublicKey()!)));

      const { error } = await supabase.from('user_passkeys').insert({
        user_id: user.id,
        credential_id: credentialId,
        public_key: publicKey,
        device_name: passkeyName,
      });

      if (error) throw error;

      toast.success('Passkey added successfully');
      setPasskeyName('');
      loadSettings();
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Passkey registration was cancelled');
      } else if (error.name === 'NotSupportedError') {
        toast.error('Passkeys are not supported on this device');
      } else {
        toast.error('Failed to add passkey: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const removePasskey = async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_passkeys')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Passkey removed');
      loadSettings();
    } catch (error: any) {
      toast.error('Failed to remove passkey');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold">Profile Settings</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl p-4 py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Require a verification code when signing in
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="2fa-toggle" className="text-base">
                  {twoFAEnabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="2fa-toggle"
                  checked={twoFAEnabled}
                  onCheckedChange={toggleTwoFA}
                  disabled={loading}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                Passkeys
              </CardTitle>
              <CardDescription>
                Use passkeys as an alternative to 2FA codes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Device name (e.g., My iPhone)"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                />
                <Button onClick={addPasskey} disabled={loading}>
                  Add Passkey
                </Button>
              </div>

              <div className="space-y-2">
                {passkeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No passkeys added yet</p>
                ) : (
                  passkeys.map((passkey) => (
                    <div
                      key={passkey.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{passkey.device_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(passkey.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePasskey(passkey.id)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-base">{user?.email}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
