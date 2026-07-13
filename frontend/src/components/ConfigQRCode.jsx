// frontend/src/components/ConfigQRCode.jsx
import React from "react";
import { QRCodeCanvas } from "qrcode.react"; // ✅ Correct import

const ConfigQRCode = ({ configText }) => {
  if (!configText) return null; // Don’t render if no config

  return (
    <div className="w-full max-w-md mx-auto mt-8 p-6 bg-gray-50 shadow-lg rounded-2xl text-center">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">
        📲 Scan to Import in WireGuard
      </h2>

      <div className="flex justify-center">
        <QRCodeCanvas
          value={configText} // ✅ WireGuard config text
          size={240}         // QR size
          level="H"          // High error correction
          includeMargin={true}
        />
      </div>

      <p className="mt-4 text-sm text-gray-600">
        Open the WireGuard app → Add Tunnel → <span className="font-medium">“Create from QR Code”</span>
      </p>
    </div>
  );
};

export default ConfigQRCode;
