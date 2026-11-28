import { OmikiLoadingScreen } from '../components/OmikiSpinner';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
} from "react";
import { getReadOnly } from "../services/userRestriction";
import { useAuth } from "./AuthContext";
const ReadOnlyContext = createContext(false);
// eslint-disable-next-line react-refresh/only-export-components
export const useReadOnly = () => useContext(ReadOnlyContext);
export function ReadOnlyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState<{
    id: string | null;
    value: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true,
      sequence = 0;
    const check = async () => {
      const request = ++sequence;
      try {
        const value = userId ? await getReadOnly() : false;
        if (active && request === sequence) {
          setState({ id: userId, value });
        }
      } catch {
        // Un corte de cobertura (habitual en el campo) no convierte la cuenta en solo lectura:
        // se conserva el último valor conocido. La base de datos sigue imponiendo el bloqueo real.
        if (active && request === sequence) {
          setState(prev => ({ id: userId, value: prev?.id === userId ? prev.value : false }));
        }
      }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [userId]);
  if (!state || state.id !== userId)
    return (
      <OmikiLoadingScreen />
    );
  return (
    <ReadOnlyContext.Provider value={state.value}>
      {state.value && (
        <p
          role="status"
          className="sticky top-0 z-[100] bg-amber-100 text-amber-950 p-3 text-center"
        >
          Cuenta en modo solo lectura. Puedes consultar tus datos, pero no modificarlos ni jugar.
        </p>
      )}
      {children}
    </ReadOnlyContext.Provider>
  );
}
export function WriteButton({
  disabled,
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const readOnly = useReadOnly();
  return (
    <button
      {...props}
      disabled={disabled || readOnly}
      title={readOnly ? "Cuenta en modo solo lectura" : title}
    />
  );
}
export function WriteForm({
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const readOnly = useReadOnly();
  return (
    <form
      {...props}
      className={undefined}
      onSubmit={(e) => {
        if (readOnly) {
          e.preventDefault();
          return;
        }
        props.onSubmit?.(e);
      }}
    >
      <fieldset className={props.className} disabled={readOnly}>
        {children}
      </fieldset>
    </form>
  );
}
