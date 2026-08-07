export interface View {
  html: string;
  mount?: () => void;
}
