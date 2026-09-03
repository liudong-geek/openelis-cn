declare module "react-avatar" {
  import type { CSSProperties, ComponentType } from "react";

  interface AvatarProps {
    alt?: string;
    color?: string;
    name?: string;
    src?: string;
    size?: string | number;
    textSizeRatio?: number;
    style?: CSSProperties;
  }

  const Avatar: ComponentType<AvatarProps>;
  export default Avatar;
}
