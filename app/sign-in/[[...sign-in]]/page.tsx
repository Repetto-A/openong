import { SignIn } from '@clerk/nextjs';

const CREATE_REDIRECT_URL = '/create';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <SignIn
        signUpUrl="/sign-up"
        fallbackRedirectUrl={CREATE_REDIRECT_URL}
        forceRedirectUrl={CREATE_REDIRECT_URL}
      />
    </div>
  );
}
