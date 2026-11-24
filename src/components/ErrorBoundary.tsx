import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isPermissionError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isPermissionError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'Terjadi kesalahan pada aplikasi.';
    let isPermissionError = false;

    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
          isPermissionError = true;
          message = `Akses database ditolak (${parsed.path ?? 'Firestore'}). Pastikan Anda sudah login dengan akun yang terdaftar pada tim.`;
        } else {
          message = parsed.error;
        }
      }
    } catch {
      if (message.toLowerCase().includes('permission')) {
        isPermissionError = true;
      }
    }

    return {
      hasError: true,
      errorMessage: message,
      isPermissionError,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-red-50 border border-red-200 text-red-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {this.state.isPermissionError
                    ? 'Akses Sinkronisasi Terbatas'
                    : 'Terjadi Gangguan Sistem'}
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {this.state.errorMessage}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang Halaman</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
