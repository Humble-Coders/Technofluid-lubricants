import { MediaUploader } from "@/components/ui/MediaUploader";
import { FormSection } from "./FormSection";
import type { MediaItem } from "@/types/visit";
import type { FormErrors } from "../_hooks/useLogVisitValidation";

type MediaSectionProps = {
  media: MediaItem[];
  onMediaChange: (items: MediaItem[]) => void;
  onLocationCaptured: (location: { lat: number; lng: number }) => void;
  uploaderId: string | null;
  errors: FormErrors;
};

export function MediaSection({
  media,
  onMediaChange,
  onLocationCaptured,
  uploaderId,
  errors,
}: MediaSectionProps) {
  return (
    <FormSection step={2} title="Media" badge="Min 1 item">
      {uploaderId ? (
        <>
          <MediaUploader
            items={media}
            uploaderId={uploaderId}
            onChange={onMediaChange}
            onLocationCaptured={onLocationCaptured}
          />
          {errors.media && (
            <div className="mt-3 text-sm text-danger">{errors.media}</div>
          )}
        </>
      ) : null}
    </FormSection>
  );
}
