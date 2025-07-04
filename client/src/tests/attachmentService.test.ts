import { describe, it, expect } from 'vitest';
import { uploadAttachment, listAttachments, deleteAttachment } from '../services/attachmentService';

describe('attachmentService', () => {
  it('throws without auth token', async () => {
    await expect(uploadAttachment('id', new File([], 'a.txt'))).rejects.toThrow();
  });

  it('listAttachments requires auth', async () => {
    await expect(listAttachments('id')).rejects.toThrow();
  });

  it('deleteAttachment requires auth', async () => {
    await expect(deleteAttachment('id', 'file.txt')).rejects.toThrow();
  });
});
