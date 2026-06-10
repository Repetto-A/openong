import { SignUp } from '@clerk/nextjs';

const CREATE_REDIRECT_URL = '/create';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <SignUp
        signInUrl="/sign-in"
        fallbackRedirectUrl={CREATE_REDIRECT_URL}
        forceRedirectUrl={CREATE_REDIRECT_URL}
      />
    </div>
  );
}
