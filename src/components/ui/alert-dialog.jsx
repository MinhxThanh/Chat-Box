import React from "react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

// Simple custom alert dialog implementation
const AlertDialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;
  return <>{children}</>;
};

const AlertDialogContent = ({ children, className, ...props }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.stopPropagation()} {...props}>
      <div 
        className={cn(
          "w-full max-w-md rounded-lg border bg-background p-4 shadow-lg", 
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

const AlertDialogHeader = ({ className, ...props }) => (
  <div
    className={cn("mb-4 space-y-2", className)}
    {...props} 
  />
);

const AlertDialogFooter = ({ className, ...props }) => (
  <div
    className={cn("mt-4 flex justify-end space-x-2", className)}
    {...props} 
  />
);

const AlertDialogTitle = ({ className, ...props }) => (
  <h3 className={cn("text-lg font-semibold", className)} {...props} />
);

const AlertDialogDescription = ({ className, ...props }) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

const AlertDialogAction = ({ className, ...props }) => (
  <Button
    className={cn(className)}
    {...props}
  />
);

const AlertDialogCancel = ({ className, ...props }) => (
  <Button
    variant="outline"
    className={cn(className)}
    {...props}
  />
);

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
