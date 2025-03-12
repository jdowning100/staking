'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui';

interface RedirectModalProps {
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
}

const RedirectModal = ({ open, onClose, onApprove }: RedirectModalProps) => {
  return (
    <Dialog open={open}>
      <DialogContent className="rounded-lg p-4 [&>button:nth-child(3)]:hidden">
        <DialogHeader className="mb-3">
          <DialogTitle className="mb-2 text-center">Are you absolutely sure you want to leave the page?</DialogTitle>
          <DialogDescription className="text-center">
            Please, don`t close or leave the page until the transaction is finished as this action may lead to
            transaction loss.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-3">
          <Button variant="nightModeButton" onClick={onApprove}>
            Leave
          </Button>
          <Button variant="kyc" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RedirectModal;
