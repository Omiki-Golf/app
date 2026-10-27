import { useContext } from 'react';
import { authContext } from './authContextValue';

export const useAuth = () => useContext(authContext);
