// Git 扩展类型定义
export interface GitExtension {
  readonly enabled: boolean
  readonly onDidChangeEnablement: Event<boolean>

  /**
   * Returns a specific API version.
   *
   * Throws error if git extension is disabled. You can listen to the
   * [GitExtension.onDidChangeEnablement](#GitExtension.onDidChangeEnablement) event
   * to know when the extension becomes enabled/disabled.
   *
   * @param version Version number.
   * @returns API instance
   */
  getAPI(version: 1): API
}

export interface API {
  readonly repositories: Repository[]
  readonly onDidOpenRepository: Event<Repository>
  readonly onDidCloseRepository: Event<Repository>
}

export interface Repository {
  readonly rootUri: Uri
  readonly inputBox: InputBox
  readonly state: RepositoryState
  diff(cached?: boolean): Promise<string>
}

export interface InputBox {
  value: string
  onDidChange: Event<string>
}

export interface RepositoryState {
  readonly indexChanges: Change[]
  readonly workingTreeChanges: Change[]
}

export interface Change {
  readonly uri: Uri
  readonly status: Status
}

export enum Status {
  INDEX_MODIFIED,
  INDEX_ADDED,
  INDEX_DELETED,
  INDEX_RENAMED,
  INDEX_COPIED,
  MODIFIED,
  DELETED,
  UNTRACKED,
  IGNORED,
  ADDED_BY_US,
  ADDED_BY_THEM,
  DELETED_BY_US,
  DELETED_BY_THEM,
  BOTH_ADDED,
  BOTH_DELETED,
  BOTH_MODIFIED,
}

type Event<T> = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => Disposable

interface Disposable {
  dispose(): void
}

interface Uri {
  readonly fsPath: string
  readonly path: string
}
