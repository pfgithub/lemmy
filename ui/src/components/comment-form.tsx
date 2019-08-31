import { Component, linkEvent } from 'inferno';
import { CommentNode as CommentNodeI, CommentForm as CommentFormI, SearchForm, SearchType, SortType, UserOperation, SearchResponse } from '../interfaces';
import { Subscription } from "rxjs";
import { capitalizeFirstLetter, fetchLimit, msgOp, md, emojiMentionList } from '../utils';
import { WebSocketService, UserService } from '../services';
import * as autosize from 'autosize';
import { i18n } from '../i18next';
import { T } from 'inferno-i18next';
import Tribute from 'tributejs/src/Tribute.js';

interface CommentFormProps {
  postId?: number;
  node?: CommentNodeI;
  onReplyCancel?(): any;
  edit?: boolean;
  disabled?: boolean;
}

interface CommentFormState {
  commentForm: CommentFormI;
  buttonTitle: string;
}

export class CommentForm extends Component<CommentFormProps, CommentFormState> {

  private id = `comment-form-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2, 10)}`;
  private userSub: Subscription;
  private communitySub: Subscription;
  private tribute: any;
  private emptyState: CommentFormState = {
    commentForm: {
      auth: null,
      content: null,
      post_id: this.props.node ? this.props.node.comment.post_id : this.props.postId,
      creator_id: UserService.Instance.user ? UserService.Instance.user.id : null,
    },
    buttonTitle: !this.props.node ? capitalizeFirstLetter(i18n.t('post')) : this.props.edit ? capitalizeFirstLetter(i18n.t('edit')) : capitalizeFirstLetter(i18n.t('reply')),
  }

  constructor(props: any, context: any) {
    super(props, context);

    this.tribute = new Tribute({
      collection: [
        // Emojis
        {
          trigger: ':',
          menuItemTemplate: (item: any) => {
            let emoji = `:${item.original.key}:`;
            return `${md.renderInline(emoji)}  ${emoji}`;
          },
          selectTemplate: (item: any) => {
            return `:${item.original.key}:`;
          },
          values: emojiMentionList(),
          allowSpaces: false,
          autocompleteMode: true,
          menuItemLimit: 10,
        },
        // Users
        {
          trigger: '@',
          selectTemplate: (item: any) => {
            return `[/u/${item.original.key}](/u/${item.original.key})`;
          },
          values: (text: string, cb: any) => {
            this.userSearch(text, (users: any) => cb(users));
          },
          allowSpaces: false,
          autocompleteMode: true,
          menuItemLimit: 10,
        },

        // Communities
        {
          trigger: '#',
          selectTemplate: (item: any) => {
            return `[/c/${item.original.key}](/c/${item.original.key})`;
          },
          values: (text: string, cb: any) => {
            this.communitySearch(text, (communities: any) => cb(communities));
          },
          allowSpaces: false,
          autocompleteMode: true,
          menuItemLimit: 10,
        }
      ]
    });

    this.state = this.emptyState;

    if (this.props.node) {
      if (this.props.edit) {
        this.state.commentForm.edit_id = this.props.node.comment.id;
        this.state.commentForm.parent_id = this.props.node.comment.parent_id;
        this.state.commentForm.content = this.props.node.comment.content;
        this.state.commentForm.creator_id = this.props.node.comment.creator_id;
      } else {
        // A reply gets a new parent id
        this.state.commentForm.parent_id = this.props.node.comment.id;
      }
    }  
  }

  componentDidMount() {
    var textarea: any = document.getElementById(this.id);
    autosize(textarea);
    this.tribute.attach(textarea);
    textarea.addEventListener('tribute-replaced', () => {
      this.state.commentForm.content = textarea.value;
      this.setState(this.state);
      autosize.update(textarea);
    });
  }

  render() {
    return (
      <div class="mb-3">
        <form onSubmit={linkEvent(this, this.handleCommentSubmit)}>
          <div class="form-group row">
            <div class="col-sm-12">
              <textarea id={this.id} class="form-control" value={this.state.commentForm.content} onInput={linkEvent(this, this.handleCommentContentChange)} required disabled={this.props.disabled} rows={2} maxLength={10000} />
            </div>
          </div>
          <div class="row">
            <div class="col-sm-12">
              <button type="submit" class="btn btn-sm btn-secondary mr-2" disabled={this.props.disabled}>{this.state.buttonTitle}</button>
              {this.props.node && <button type="button" class="btn btn-sm btn-secondary" onClick={linkEvent(this, this.handleReplyCancel)}><T i18nKey="cancel">#</T></button>}
            </div>
          </div>
        </form>
      </div>
    );
  }

  handleCommentSubmit(i: CommentForm, event: any) {
    event.preventDefault();
    if (i.props.edit) {
      WebSocketService.Instance.editComment(i.state.commentForm);
    } else {
      WebSocketService.Instance.createComment(i.state.commentForm);
    }

    i.state.commentForm.content = undefined;
    i.setState(i.state);
    event.target.reset();
    if (i.props.node) {
      i.props.onReplyCancel();
    }

    autosize.update(document.querySelector('textarea'));
  }

  handleCommentContentChange(i: CommentForm, event: any) {
    i.state.commentForm.content = event.target.value;
    i.setState(i.state);
  }

  handleReplyCancel(i: CommentForm) {
    i.props.onReplyCancel();
  }
  
  userSearch(text: string, cb: any) {
    if (text) {
      let form: SearchForm = {
        q: text,
        type_: SearchType[SearchType.Users],
        sort: SortType[SortType.TopAll],
        page: 1,
        limit: 6,
      };

      WebSocketService.Instance.search(form);

      this.userSub = WebSocketService.Instance.subject
      .subscribe(
        (msg) => {  
          let op: UserOperation = msgOp(msg);
          if (op == UserOperation.Search) {
            let res: SearchResponse = msg;
            let users = res.users.map(u => {return {key: u.name}});
            cb(users);
            this.userSub.unsubscribe();
          }
        },
        (err) => console.error(err),
        () => console.log('complete')
      );
    } else {
      cb([]);
    }
  }

  communitySearch(text: string, cb: any) {
    if (text) {
      let form: SearchForm = {
        q: text,
        type_: SearchType[SearchType.Communities],
        sort: SortType[SortType.TopAll],
        page: 1,
        limit: 6,
      };

      WebSocketService.Instance.search(form);

      this.communitySub = WebSocketService.Instance.subject
      .subscribe(
        (msg) => {  
          let op: UserOperation = msgOp(msg);
          if (op == UserOperation.Search) {
            let res: SearchResponse = msg;
            let communities = res.communities.map(u => {return {key: u.name}});
            cb(communities);
            this.communitySub.unsubscribe();
          }
        },
        (err) => console.error(err),
        () => console.log('complete')
      );
    } else {
      cb([]);
    }
  }
}
