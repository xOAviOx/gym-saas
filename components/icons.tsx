import type { IconProps } from '@phosphor-icons/react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowSquareOut,
  ArrowsOut,
  Backspace,
  Barbell,
  CalendarDots,
  Camera,
  CameraSlash,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  Copy,
  CurrencyInr,
  DeviceTablet,
  DoorOpen,
  DotsThree,
  DownloadSimple,
  EnvelopeSimpleOpen,
  FileXls,
  Gear,
  House,
  IdentificationCard,
  Info,
  Keyboard,
  LockSimple,
  MagnifyingGlass,
  Minus,
  Plus,
  Printer,
  Prohibit,
  QrCode,
  Scan,
  ShareNetwork,
  SignIn,
  SignOut,
  Trash,
  User,
  UserCheck,
  UserPlus,
  Users,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react/ssr';
import type { ComponentType } from 'react';

/**
 * The app's only icon source. Phosphor's SSR build has no React context, so the
 * same components render in Server and Client Components; every icon is preset
 * to the bold weight so stroke width stays uniform.
 */
export type AppIcon = ComponentType<IconProps>;

function bold(Base: ComponentType<IconProps>, name: string): AppIcon {
  function Icon(props: IconProps) {
    return <Base weight="bold" aria-hidden="true" {...props} />;
  }
  Icon.displayName = name;
  return Icon;
}

export const AlertCircleIcon = bold(WarningCircle, 'AlertCircleIcon');
export const ArrowLeftIcon = bold(ArrowLeft, 'ArrowLeftIcon');
export const BackspaceIcon = bold(Backspace, 'BackspaceIcon');
export const BarbellIcon = bold(Barbell, 'BarbellIcon');
export const CalendarDaysIcon = bold(CalendarDots, 'CalendarDaysIcon');
export const CameraIcon = bold(Camera, 'CameraIcon');
export const CameraOffIcon = bold(CameraSlash, 'CameraOffIcon');
export const CheckCircle2Icon = bold(CheckCircle, 'CheckCircle2Icon');
export const CheckIcon = bold(Check, 'CheckIcon');
export const ChevronDownIcon = bold(CaretDown, 'ChevronDownIcon');
export const ChevronLeftIcon = bold(CaretLeft, 'ChevronLeftIcon');
export const ChevronRightIcon = bold(CaretRight, 'ChevronRightIcon');
export const ChevronUpIcon = bold(CaretUp, 'ChevronUpIcon');
export const CircleCheckIcon = bold(CheckCircle, 'CircleCheckIcon');
export const ClockIcon = bold(Clock, 'ClockIcon');
export const CopyIcon = bold(Copy, 'CopyIcon');
export const DoorOpenIcon = bold(DoorOpen, 'DoorOpenIcon');
export const DownloadIcon = bold(DownloadSimple, 'DownloadIcon');
export const EllipsisIcon = bold(DotsThree, 'EllipsisIcon');
export const ExternalLinkIcon = bold(ArrowSquareOut, 'ExternalLinkIcon');
export const FileSpreadsheetIcon = bold(FileXls, 'FileSpreadsheetIcon');
export const FullscreenIcon = bold(ArrowsOut, 'FullscreenIcon');
export const HouseIcon = bold(House, 'HouseIcon');
export const IdCardIcon = bold(IdentificationCard, 'IdCardIcon');
export const IndianRupeeIcon = bold(CurrencyInr, 'IndianRupeeIcon');
export const InfoIcon = bold(Info, 'InfoIcon');
export const KeyboardIcon = bold(Keyboard, 'KeyboardIcon');
export const Loader2Icon = bold(CircleNotch, 'Loader2Icon');
export const LockIcon = bold(LockSimple, 'LockIcon');
export const LogInIcon = bold(SignIn, 'LogInIcon');
export const LogOutIcon = bold(SignOut, 'LogOutIcon');
export const MailCheckIcon = bold(EnvelopeSimpleOpen, 'MailCheckIcon');
export const MinusIcon = bold(Minus, 'MinusIcon');
export const OctagonXIcon = bold(XCircle, 'OctagonXIcon');
export const PlusIcon = bold(Plus, 'PlusIcon');
export const PrinterIcon = bold(Printer, 'PrinterIcon');
export const ProhibitIcon = bold(Prohibit, 'ProhibitIcon');
export const QrCodeIcon = bold(QrCode, 'QrCodeIcon');
export const RefreshIcon = bold(ArrowClockwise, 'RefreshIcon');
export const RotateCcwIcon = bold(ArrowCounterClockwise, 'RotateCcwIcon');
export const ScanLineIcon = bold(Scan, 'ScanLineIcon');
export const SearchIcon = bold(MagnifyingGlass, 'SearchIcon');
export const SettingsIcon = bold(Gear, 'SettingsIcon');
export const Share2Icon = bold(ShareNetwork, 'Share2Icon');
export const TabletIcon = bold(DeviceTablet, 'TabletIcon');
export const Trash2Icon = bold(Trash, 'Trash2Icon');
export const TriangleAlertIcon = bold(Warning, 'TriangleAlertIcon');
export const UserCheckIcon = bold(UserCheck, 'UserCheckIcon');
export const UserPlusIcon = bold(UserPlus, 'UserPlusIcon');
export const UserRoundIcon = bold(User, 'UserRoundIcon');
export const UsersIcon = bold(Users, 'UsersIcon');
export const XIcon = bold(X, 'XIcon');
