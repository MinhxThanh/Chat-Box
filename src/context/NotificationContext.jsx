import React, { createContext, useState, useContext } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

// Create context
const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [alert, setAlert] = useState({
    open: false,
    title: '',
    message: '',
    onConfirm: null,
    showCancel: false,
  });

  const showAlert = (title, message, onConfirm = null, showCancel = false) => {
    setAlert({
      open: true,
      title,
      message,
      onConfirm,
      showCancel,
    });
  };

  const closeAlert = () => {
    setAlert(prev => ({ ...prev, open: false }));
  };

  const handleConfirm = () => {
    if (alert.onConfirm) {
      alert.onConfirm();
    }
    closeAlert();
  };

  return (
    <NotificationContext.Provider value={{ showAlert }}>
      {children}
      
      <AlertDialog open={alert.open} onOpenChange={closeAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alert.title}</AlertDialogTitle>
            <AlertDialogDescription>{alert.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {alert.showCancel && (
              <AlertDialogCancel onClick={closeAlert}>Cancel</AlertDialogCancel>
            )}
            <AlertDialogAction onClick={handleConfirm}>
              {alert.onConfirm ? 'Confirm' : 'OK'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NotificationContext.Provider>
  );
};
