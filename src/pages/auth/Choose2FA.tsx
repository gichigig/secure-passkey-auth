import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Key, Smartphone } from 'lucide-react';

export default function Choose2FA() {
  const [loading, setLoading] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const userId = location.state?.userId;

  useEffect(() => {
    checkPasskeys();
  }, [userId]);

  const checkPasskeys = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('user_passkeys')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (!error && data && data.length > 0) {
      setHasPasskeys(true);
    }
  };

  const handleUseCode = () => {
    navigate('/auth/verify-2fa', { state: { userId } });
  };

  const handleUsePasskey = async () => {
    // Check if running in iframe (preview environment)
    if (window.self !== window.top) {
      toast.error('Passkeys cannot be used in preview mode. Please use 2FA code or deploy your app.');
      return;
    }

    setLoading(true);
    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('Passkeys are not supported on this browser');
      }

      // Get user's passkeys from database
      const { data: passkeys, error: fetchError } = await supabase
        .from('user_passkeys')
        .select('credential_id')
        .eq('user_id', userId);

      if (fetchError) throw fetchError;
      if (!passkeys || passkeys.length === 0) {
        toast.error('No passkeys found. Please use 2FA code.');
        return;
      }

      // Create challenge
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Convert credential IDs
      const allowCredentials = passkeys.map((pk) => ({
        type: 'public-key' as const,
        id: Uint8Array.from(atob(pk.credential_id), c => c.charCodeAt(0)),
      }));

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        allowCredentials,
        timeout: 60000,
        userVerification: 'preferred',
      };

      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to authenticate with passkey');
      }

      // Passkey authentication successful
      toast.success('Passkey verified successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Passkey authentication error:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Passkey authentication was cancelled');
      } else {
        toast.error('Failed to authenticate with passkey: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!userId) {
    navigate('/auth/login');
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Choose Verification Method</CardTitle>
          <CardDescription>Select how you'd like to verify your identity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full h-auto py-4 flex flex-col items-center gap-2"
            onClick={handleUseCode}
            disabled={loading}
          >
            <Smartphone className="h-6 w-6" />
            <div className="text-center">
              <div className="font-semibold">Use Authenticator Code</div>
              <div className="text-xs text-muted-foreground">Enter 6-digit code from your app</div>
            </div>
          </Button>

          {hasPasskeys && (
            <Button
              variant="outline"
              className="w-full h-auto py-4 flex flex-col items-center gap-2"
              onClick={handleUsePasskey}
              disabled={loading}
            >
              <Key className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Use Passkey</div>
                <div className="text-xs text-muted-foreground">
                  Verify with biometrics or security key
                </div>
              </div>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
