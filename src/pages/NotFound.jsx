import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl font-semibold text-gray-300">404</div>
      <p className="mt-2 text-sm text-gray-500">This page doesn’t exist.</p>
      <Link to="/" className="mt-4 text-sm font-medium text-brand-600 hover:underline">Back to Dashboard</Link>
    </div>
  );
}
