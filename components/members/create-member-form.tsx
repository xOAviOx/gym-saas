'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PlanFields } from '@/components/memberships/plan-fields';
import { announceMessage } from '@/components/messages/announce-message';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import { WorkflowSteps } from '@/components/shared/workflow-steps';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Form } from '@/components/ui/form';
import { createMember, saveMemberPhoto } from '@/features/members/actions';
import {
  createMemberSchema,
  emptyMemberValues,
  type CreateMemberInput,
} from '@/features/members/schema';
import type { Plan } from '@/features/plans/types';
import { copy } from '@/lib/copy';
import type { MessageLanguage } from '@/lib/messaging/templates';

import { MemberFields } from './member-fields';

export function CreateMemberForm({
  today,
  plans,
  gstEnabled,
  requestId,
  defaultLanguage,
}: {
  today: string;
  plans: Plan[];
  gstEnabled: boolean;
  requestId: string;
  defaultLanguage: MessageLanguage;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoPreviewRef = useRef<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  useEffect(() => () => cameraStream.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => {
    if (cameraOpen && video.current && cameraStream.current) {
      video.current.srcObject = cameraStream.current;
    }
  }, [cameraOpen]);
  useEffect(
    () => () => {
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    },
    [],
  );
  function selectPhoto(file: File | undefined) {
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error(copy.members.photoInvalid);
      return;
    }
    setPhoto(file);
    if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    photoPreviewRef.current = URL.createObjectURL(file);
    setPhotoPreview(photoPreviewRef.current);
  }
  function closeCamera() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraOpen(false);
  }
  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInput.current?.click();
      return;
    }
    try {
      cameraStream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraOpen(true);
    } catch {
      toast.error(copy.members.cameraUnavailable);
    }
  }
  async function capturePhoto() {
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) {
      toast.error(copy.members.cameraUnavailable);
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale);
    canvas.height = Math.round(source.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) {
      toast.error(copy.members.cameraUnavailable);
      return;
    }
    selectPhoto(new File([blob], 'member-photo.jpg', { type: 'image/jpeg' }));
    closeCamera();
  }
  const form = useForm<CreateMemberInput>({
    resolver: zodResolver(createMemberSchema, undefined, { raw: true }),
    defaultValues: {
      ...emptyMemberValues(today, defaultLanguage),
      requestId,
      planId: plans[0]?.id ?? '',
      startDate: today,
      discount: '0',
    },
  });
  async function onSubmit(values: CreateMemberInput) {
    if (step === 1) {
      closeCamera();
      setStep(2);
      return;
    }
    setPending(true);
    try {
      const result = await createMember(values);
      if (applyActionResult(result, form.setError)) {
        let photoSaved = true;
        if (photo) {
          const data = new FormData();
          data.set('memberId', result.data.id);
          data.set('photo', photo);
          try {
            photoSaved = (await saveMemberPhoto(data)).ok;
          } catch {
            photoSaved = false;
          }
        }
        if (photoSaved) toast.success(copy.members.created);
        else toast.warning(copy.members.createdPhotoFailed);
        announceMessage(result.data.message, 'welcome');
        router.push(`/members/${result.data.id}`);
        return;
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  async function nextStep() {
    const valid = await form.trigger([
      'fullName',
      'phone',
      'altPhone',
      'email',
      'gender',
      'dob',
      'address',
      'joinedOn',
      'source',
      'emergencyContactName',
      'emergencyContactPhone',
      'notes',
      'tags',
      'consentMessaging',
      'preferredLanguage',
    ]);
    if (valid) {
      closeCamera();
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit, () => {
            if (form.formState.errors.fullName || form.formState.errors.phone) setStep(1);
          })(event);
        }}
        noValidate
        className="mx-auto max-w-xl"
      >
        <div className="mb-6">
          <WorkflowSteps
            label={copy.members.createProgress}
            steps={copy.members.createSteps}
            current={step - 1}
          />
        </div>
        <fieldset disabled={pending}>
          <div hidden={step !== 1}>
            <MemberFields today={today} />
            <div className="mt-6 flex items-center gap-4 rounded-xl border p-4">
              <Avatar className="size-16 rounded-xl">
                <AvatarImage src={photoPreview ?? undefined} alt={copy.members.photo} />
                <AvatarFallback className="rounded-xl">{copy.members.photoInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">{copy.members.photo}</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={cameraInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    aria-label={copy.members.takePhoto}
                    onChange={(event) => {
                      selectPhoto(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    aria-label={copy.members.choosePhoto}
                    onChange={(event) => {
                      selectPhoto(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cameraOpen}
                    onClick={() => void openCamera()}
                  >
                    {copy.members.takePhoto}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInput.current?.click()}
                  >
                    {copy.members.choosePhoto}
                  </Button>
                  {photo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
                        photoPreviewRef.current = null;
                        setPhoto(null);
                        setPhotoPreview(null);
                      }}
                    >
                      {copy.members.removeSelectedPhoto}
                    </Button>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">{copy.members.photoHelp}</p>
              </div>
            </div>
            {cameraOpen ? (
              <div className="mt-3 rounded-xl border p-3">
                <video
                  ref={video}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full rounded-lg bg-black object-cover"
                />
                <div className="mt-3 flex gap-2">
                  <Button type="button" onClick={() => void capturePhoto()}>
                    {copy.members.capturePhoto}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeCamera}>
                    {copy.common.cancel}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div hidden={step !== 2}>
            <PlanFields plans={plans} optional gstEnabled={gstEnabled} />
          </div>
        </fieldset>
        <div className="bg-background/95 sticky bottom-16 -mx-4 mt-6 flex gap-3 px-4 py-3 backdrop-blur md:bottom-0">
          {step === 1 ? (
            <Button type="button" className="w-full" onClick={nextStep}>
              {copy.members.nextStep}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep(1)}>
                {copy.common.back}
              </Button>
              <SubmitButton className="flex-1" pending={pending} pendingLabel={copy.common.saving}>
                {copy.members.create}
              </SubmitButton>
            </>
          )}
        </div>
      </form>
    </Form>
  );
}
