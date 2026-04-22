import { Component, inject, output, signal, computed } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { FriendshipService, Friend, FriendResult, PrivacySettings } from './friendship.service'

type PanelTab = 'friends' | 'requests' | 'search' | 'privacy'

@Component({
  selector: 'app-friend-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()"></div>
    <aside class="panel">
      <div class="panel-header">
        <span class="panel-title">Friends</span>
        <button class="close-btn" (click)="close.emit()">✕</button>
      </div>

      <div class="tabs">
        <button class="tab" [class.active]="tab()==='friends'"  (click)="setTab('friends')">Friends</button>
        <button class="tab" [class.active]="tab()==='requests'" (click)="setTab('requests')">
          Requests
          <span class="badge" *ngIf="incomingCount() > 0">{{ incomingCount() }}</span>
        </button>
        <button class="tab" [class.active]="tab()==='search'"   (click)="setTab('search')">Add</button>
        <button class="tab" [class.active]="tab()==='privacy'"  (click)="setTab('privacy')">Privacy</button>
      </div>

      <!-- Friends list -->
      <div class="tab-content" *ngIf="tab()==='friends'">
        <div class="empty" *ngIf="friends().length === 0">No friends yet. Try adding someone!</div>
        <div class="friend-row" *ngFor="let f of friends()">
          <span class="friend-name">{{ f.username }}</span>
          <div class="row-actions">
            <button class="btn-view" (click)="viewFriend.emit(f)">View</button>
            <button class="btn-remove" (click)="removeFriend(f)">Remove</button>
          </div>
        </div>
      </div>

      <!-- Requests -->
      <div class="tab-content" *ngIf="tab()==='requests'">
        <div *ngIf="incoming().length > 0">
          <div class="section-label">Incoming</div>
          <div class="friend-row" *ngFor="let r of incoming()">
            <span class="friend-name">{{ r.username }}</span>
            <div class="row-actions">
              <button class="btn-accept" (click)="acceptRequest(r)">Accept</button>
              <button class="btn-remove" (click)="rejectRequest(r)">Reject</button>
            </div>
          </div>
        </div>
        <div *ngIf="outgoing().length > 0" style="margin-top:16px">
          <div class="section-label">Sent</div>
          <div class="friend-row" *ngFor="let r of outgoing()">
            <span class="friend-name">{{ r.username }}</span>
            <button class="btn-remove" (click)="cancelRequest(r)">Cancel</button>
          </div>
        </div>
        <div class="empty" *ngIf="incoming().length === 0 && outgoing().length === 0">No pending requests</div>
      </div>

      <!-- Search & Add -->
      <div class="tab-content" *ngIf="tab()==='search'">
        <div class="search-row">
          <input class="search-input" [(ngModel)]="searchQ" placeholder="Search username..." (keyup.enter)="doSearch()" />
          <button class="btn-search" (click)="doSearch()">Search</button>
        </div>
        <div class="search-results">
          <div class="friend-row" *ngFor="let u of searchResults()">
            <span class="friend-name">{{ u.username }}</span>
            <div class="row-actions">
              <span class="status-text" *ngIf="u.friendshipStatus === 'accepted'">✓ Friends</span>
              <span class="status-text pending" *ngIf="u.friendshipStatus === 'pending' && u.iSentRequest">Sent</span>
              <span class="status-text pending" *ngIf="u.friendshipStatus === 'pending' && !u.iSentRequest">Pending</span>
              <button class="btn-add" *ngIf="u.friendshipStatus === null" (click)="sendRequest(u)">Add</button>
            </div>
          </div>
          <div class="empty" *ngIf="searched && searchResults().length === 0">No users found</div>
        </div>
      </div>

      <!-- Privacy Settings -->
      <div class="tab-content" *ngIf="tab()==='privacy'">
        <p class="privacy-desc">เลือกสิ่งที่ต้องการให้ friend เห็น</p>
        <div class="privacy-list" *ngIf="privacy()">
          <label class="privacy-row">
            <span>Total P/L</span>
            <input type="checkbox" [(ngModel)]="privacy()!.showPnL" (change)="savePrivacy()" />
          </label>
          <label class="privacy-row">
            <span>Win Rate & Stats</span>
            <input type="checkbox" [(ngModel)]="privacy()!.showWinRate" (change)="savePrivacy()" />
          </label>
          <label class="privacy-row">
            <span>Equity Chart</span>
            <input type="checkbox" [(ngModel)]="privacy()!.showChart" (change)="savePrivacy()" />
          </label>
          <label class="privacy-row">
            <span>Trade History</span>
            <input type="checkbox" [(ngModel)]="privacy()!.showTrades" (change)="savePrivacy()" />
          </label>
          <label class="privacy-row">
            <span>Balance / Equity</span>
            <input type="checkbox" [(ngModel)]="privacy()!.showBalance" (change)="savePrivacy()" />
          </label>
        </div>
        <div class="save-msg" *ngIf="privacySaved">✓ Saved</div>
      </div>
    </aside>
  `,
  styles: [`
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:100; }
    .panel { position:fixed; top:0; right:0; bottom:0; width:340px; background:#161b22; border-left:1px solid #30363d; z-index:101; display:flex; flex-direction:column; }
    .panel-header { display:flex; justify-content:space-between; align-items:center; padding:18px 20px; border-bottom:1px solid #30363d; }
    .panel-title { font-size:16px; font-weight:700; color:#e6edf3; }
    .close-btn { background:none; border:none; color:#8b949e; font-size:18px; cursor:pointer; }
    .tabs { display:flex; border-bottom:1px solid #30363d; }
    .tab { flex:1; background:none; border:none; padding:10px 4px; color:#8b949e; font-size:12px; font-weight:500; cursor:pointer; position:relative; border-bottom:2px solid transparent; }
    .tab.active { color:#58a6ff; border-bottom-color:#58a6ff; }
    .badge { background:#f85149; color:#fff; border-radius:999px; font-size:10px; padding:1px 5px; margin-left:4px; }
    .tab-content { flex:1; overflow-y:auto; padding:16px; }
    .section-label { font-size:11px; color:#8b949e; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
    .friend-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#0d1117; border:1px solid #30363d; border-radius:8px; margin-bottom:8px; }
    .friend-name { color:#e6edf3; font-size:14px; font-weight:500; }
    .row-actions { display:flex; gap:6px; }
    .btn-view   { background:#1f6feb; color:#fff; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; }
    .btn-accept { background:#238636; color:#fff; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; }
    .btn-remove { background:#21262d; color:#f85149; border:1px solid #f85149; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; }
    .btn-add    { background:#238636; color:#fff; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; }
    .btn-search { background:#1f6feb; color:#fff; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; }
    .search-row { display:flex; gap:8px; margin-bottom:14px; }
    .search-input { flex:1; background:#0d1117; border:1px solid #30363d; border-radius:8px; padding:8px 12px; color:#e6edf3; font-size:13px; outline:none; }
    .search-input:focus { border-color:#58a6ff; }
    .status-text { font-size:12px; color:#8b949e; }
    .status-text.pending { color:#d29922; }
    .empty { text-align:center; color:#8b949e; padding:40px 0; font-size:13px; }
    .privacy-desc { color:#8b949e; font-size:13px; margin-bottom:16px; }
    .privacy-list { display:flex; flex-direction:column; gap:4px; }
    .privacy-row { display:flex; justify-content:space-between; align-items:center; padding:12px; background:#0d1117; border:1px solid #30363d; border-radius:8px; color:#e6edf3; font-size:14px; cursor:pointer; }
    .privacy-row input[type=checkbox] { width:16px; height:16px; cursor:pointer; accent-color:#58a6ff; }
    .save-msg { color:#3fb950; font-size:13px; margin-top:12px; text-align:center; }
  `]
})
export class FriendPanelComponent {
  private svc = inject(FriendshipService)

  close     = output<void>()
  viewFriend = output<Friend>()

  tab          = signal<PanelTab>('friends')
  friends      = signal<Friend[]>([])
  incoming     = signal<Friend[]>([])
  outgoing     = signal<Friend[]>([])
  searchResults = signal<FriendResult[]>([])
  privacy      = signal<PrivacySettings | null>(null)
  privacySaved = false
  searchQ      = ''
  searched     = false

  incomingCount = computed(() => this.incoming().length)

  constructor() {
    this.loadFriends()
    this.loadPending()
    this.loadPrivacy()
  }

  setTab(tab: PanelTab) {
    this.tab.set(tab)
    if (tab === 'friends')  this.loadFriends()
    if (tab === 'requests') this.loadPending()
    if (tab === 'privacy')  this.loadPrivacy()
  }

  loadFriends() {
    this.svc.listFriends().subscribe(f => this.friends.set(f))
  }

  loadPending() {
    this.svc.listPending().subscribe(p => {
      this.incoming.set(p.incoming)
      this.outgoing.set(p.outgoing)
    })
  }

  loadPrivacy() {
    this.svc.getPrivacy().subscribe(p => this.privacy.set(p))
  }

  doSearch() {
    this.searched = true
    this.svc.search(this.searchQ).subscribe(r => this.searchResults.set(r))
  }

  sendRequest(u: FriendResult) {
    this.svc.sendRequest(u._id).subscribe(() => this.doSearch())
  }

  acceptRequest(r: Friend) {
    this.svc.accept(r.friendshipId).subscribe(() => {
      this.loadPending()
      this.loadFriends()
    })
  }

  rejectRequest(r: Friend) {
    this.svc.remove(r.friendshipId).subscribe(() => this.loadPending())
  }

  cancelRequest(r: Friend) {
    this.svc.remove(r.friendshipId).subscribe(() => this.loadPending())
  }

  removeFriend(f: Friend) {
    if (!confirm(`Remove ${f.username}?`)) return
    this.svc.remove(f.friendshipId).subscribe(() => this.loadFriends())
  }

  savePrivacy() {
    const p = this.privacy()
    if (!p) return
    this.svc.updatePrivacy(p).subscribe(() => {
      this.privacySaved = true
      setTimeout(() => this.privacySaved = false, 2000)
    })
  }
}
