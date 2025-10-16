import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';

export default function Setup2FA() {
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const userId = location.state?.userId;

  useEffect(() => {
    if (!userId) {
      navigate('/auth/login');
      return;
    }

    const generateSecret = async () => {
      const totp = new OTPAuth.TOTP({
        issuer: 'SecureAuth',
        label: 'SecureAuth',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      const newSecret = totp.secret.base32;
      setSecret(newSecret);

      const otpauthUrl = totp.toString();
      const qr = await QRCode.toDataURL(otpauthUrl);
      setQrCode(qr);
    };

    generateSecret();
  }, [userId, navigate]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const totp = new OTPAuth.TOTP({
        issuer: 'SecureAuth',
        label: 'SecureAuth',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const delta = totp.validate({ token, window: 1 });

      if (delta === null) {
        toast.error('Invalid code. Please try again.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('user_2fa').insert({
        user_id: userId,
        secret: secret,
        enabled: true,
      });

      if (error) throw error;

      toast.success('2FA setup complete!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Secret copied to clipboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Setup 2FA</CardTitle>
          <CardDescription>Scan the QR code with your authenticator app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {qrCode && (
            <div className="flex flex-col items-center space-y-4">
              <img src={qrCode} alt="QR Code" className="rounded-lg border-2 border-border" />
              <div className="w-full space-y-2">
                <Label>Or enter this code manually:</Label>
                <div className="flex gap-2">
                  <Input value={secret} readOnly className="font-mono text-sm" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copySecret}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Verification Code</Label>
              <Input
                id="token"
                type="text"
                placeholder="Enter 6-digit code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                maxLength={6}
                required
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Complete Setup'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
