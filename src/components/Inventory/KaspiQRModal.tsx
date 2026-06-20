import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';
import QRCode from 'qrcode';

interface Props {
  amount: number;
  saleId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const KASPI_MERCHANT_ID = import.meta.env.VITE_KASPI_MERCHANT_ID ?? '';
const KASPI_MERCHANT_NAME = import.meta.env.VITE_KASPI_MERCHANT_NAME ?? 'Оптика';

export default function KaspiQRModal({ amount, saleId, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'waiting' | 'confirmed'>('waiting');
  const [seconds, setSeconds] = useState(300); // 5 минут таймаут

  useEffect(() => {
    if (!canvasRef.current) return;
    // Генерируем QR с данными платежа
    // В реальной интеграции здесь будет deeplink от Kaspi API
    const kaspiDeeplink = `kaspi://pay?merchantId=${KASPI_MERCHANT_ID}&amount=${amount}&orderId=${saleId}&name=${encodeURIComponent(KASPI_MERCHANT_NAME)}`;
    QRCode.toCanvas(canvasRef.current, kaspiDeeplink, {
      width: 220,
      margin: 2,
      color: { dark: '#003366', light: '#ffffff' }
    });
  }, [amount, saleId]);

  // Таймер обратного отсчёта
  useEffect(() => {
    if (status === 'confirmed') return;
    const timer = setInterval(() => {
      setSeconds(s => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Вызываем onCancel когда таймер истёк (вне setState updater)
  useEffect(() => {
    if (seconds === 0 && status === 'waiting') {
      onCancel();
    }
  }, [seconds, status]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const isConfirmingRef = useRef(false);
  const handleConfirm = () => {
    if (isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    setStatus('confirmed');
    setTimeout(onConfirm, 1000);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70" data-modal="true">
      <div className="bg-white rounded-2xl w-80 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-[#003366] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#FFA500] rounded-full flex items-center justify-center text-white text-xs font-bold">K</div>
            <span className="text-white font-semibold text-sm">Kaspi Pay</span>
          </div>
          <button onClick={onCancel} className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-6 flex flex-col items-center gap-4">
          {status === 'waiting' ? (
            <>
              <p className="text-2xl font-bold text-gray-900">₸{amount.toLocaleString()}</p>
              <p className="text-xs text-gray-400 text-center">Покупатель сканирует QR в приложении Kaspi</p>

              {/* QR код */}
              <div className="border-4 border-[#003366] rounded-xl p-2">
                <canvas ref={canvasRef} />
              </div>

              {/* Таймер */}
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Clock size={14} />
                <span>Истекает через {formatTime(seconds)}</span>
              </div>

              <div className="w-full space-y-2">
                {/* Кнопка подтверждения вручную (до интеграции API) */}
                <button onClick={handleConfirm}
                  className="w-full py-3 bg-[#003366] text-white rounded-xl text-sm font-medium hover:bg-[#002244]">
                  ✓ Подтвердить оплату вручную
                </button>
                <p className="text-[10px] text-gray-400 text-center">
                  После подключения Kaspi API подтверждение будет автоматическим
                </p>
                <button onClick={onCancel}
                  className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <div className="py-8 flex flex-col items-center gap-3">
              <CheckCircle size={56} className="text-green-500" />
              <p className="text-lg font-semibold text-gray-900">Оплата подтверждена</p>
              <p className="text-sm text-gray-400">₸{amount.toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
