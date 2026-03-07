/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter } from 'react-router-dom';
import RevenueRoutes from './modules/revenue/RevenueRoutes';
import { AuthProvider } from './modules/revenue/context/AuthContext';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RevenueRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
