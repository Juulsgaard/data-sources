
export class CreateAction {

  public static Create(name: string, icon: string, action: () => void) {
    return new CreateAction(name, icon, action);
  }

  private uploadAction?: (file: File) => void|Promise<any>;
  private multiFile = false;

  get canUpload() {return !!this.uploadAction}

  constructor(public name: string, public icon: string, private action: () => void) {
  }

  withUpload(action: (file: File) => void|Promise<any>, multiFile: boolean = false) {
    this.uploadAction = action;
    this.multiFile = multiFile;
    return this;
  }

  create() {
    this.action();
  }

  async upload(files: File[]|File|FileList) {
    if (!this.uploadAction) return;
    if (files instanceof FileList) files = Array.from(files);
    if (!Array.isArray(files)) files = [files];

    if (!files.length) return;

    if (this.multiFile) {
      for (let file of files) {
        await this.uploadAction(file);
      }
      return;
    }

    await this.uploadAction(files[0]!);
  }

}
