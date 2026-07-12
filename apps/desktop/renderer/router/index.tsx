import { createBrowserRouter } from 'react-router-dom';

import { HomeScreen } from '@/pages/HomeScreen';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <HomeScreen />
    }
]);
