/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** Types of columns supported by the API */
export type ColumnType =
  /** Number items according to their order in the group/board */
  | 'auto_number'
  /** Connect data from other boards */
  | 'board_relation'
  /** Perform actions on items by clicking a button */
  | 'button'
  /** Check off items and see what's done at a glance */
  | 'checkbox'
  /** Manage a design system using a color palette */
  | 'color_picker'
  /** Choose a country */
  | 'country'
  /** Add the item's creator and creation date automatically */
  | 'creation_log'
  /** Add dates like deadlines to ensure you never drop the ball */
  | 'date'
  /** Set up dependencies between items in the board */
  | 'dependency'
  /** Document your work and increase collaboration */
  | 'direct_doc'
  /** Document your work and increase collaboration */
  | 'doc'
  /** Create a dropdown list of options */
  | 'dropdown'
  /** Email team members and clients directly from your board */
  | 'email'
  /** Add files & docs to your item */
  | 'file'
  /** Use functions to manipulate data across multiple columns */
  | 'formula'
  | 'group'
  /** Add times to manage and schedule tasks, shifts and more */
  | 'hour'
  /** Integration is really cool... */
  | 'integration'
  /** Show all item's assignees */
  | 'item_assignees'
  /** Show a unique ID for each item */
  | 'item_id'
  /** Add the person that last updated the item and the date */
  | 'last_updated'
  /** Simply hyperlink to any website */
  | 'link'
  /** Place multiple locations on a geographic map */
  | 'location'
  /** Add large amounts of text without changing column width */
  | 'long_text'
  /** Show and edit columns' data from connected boards */
  | 'mirror'
  /** Name is really cool... */
  | 'name'
  /** Add revenue, costs, time estimations and more */
  | 'numbers'
  /** Assign people to improve team work */
  | 'people'
  /** Assign a person to increase ownership and accountability (deprecated) */
  | 'person'
  /** Call your contacts directly from monday.com */
  | 'phone'
  /** Show progress by combining status columns in a battery */
  | 'progress'
  /** Rate or rank anything visually */
  | 'rating'
  /** Get an instant overview of where things stand */
  | 'status'
  /** Use the subtasks column to create another level of tasks */
  | 'subtasks'
  /** Add tags to categorize items across multiple boards */
  | 'tags'
  /** Assign a full team to an item */
  | 'team'
  /** Add textual information e.g. addresses, names or keywords */
  | 'text'
  /** Easily track time spent on each item, group, and board */
  | 'time_tracking'
  /** Visualize your item’s duration, with a start and end date */
  | 'timeline'
  /** Unsupported column type */
  | 'unsupported'
  /** Vote on an item e.g. pick a new feature or a favorite lunch place */
  | 'vote'
  /** Select the week on which each item should be completed */
  | 'week'
  /** Keep track of the time anywhere in the world */
  | 'world_clock';

/** Kind of assignee */
export type Kind =
  /** Represents an AI agent */
  | 'agent'
  /** Represents a person */
  | 'person'
  /** Represents a team */
  | 'team';

/** Indicates where the unit symbol should be placed in a number value */
export type NumberValueUnitDirection =
  /** The symbol is placed on the left of the number */
  | 'left'
  /** The symbol is placed on the right of the number */
  | 'right';

/** The possible states for a board or item. */
export type State =
  /** Active only (Default). */
  | 'active'
  /** Active, Archived and Deleted. */
  | 'all'
  /** Archived only. */
  | 'archived'
  /** Deleted only. */
  | 'deleted';

/** The activation status of a user. */
export type UserStatus =
  /** The user is active. */
  | 'ACTIVE'
  /** The user is deactivated. */
  | 'INACTIVE'
  /** The user has not yet accepted the invitation. */
  | 'PENDING';

export type ItemFieldsFragment = { id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
    | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
    | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
    | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
    | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
    | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
  > };

export type ItemTreeFragment = { id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
              | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
              | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
              | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
              | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
            > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
            | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
            | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
            | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
            | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
          > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
          | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
          | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
          | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
          | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
        > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
        | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
        | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
        | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
        | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
        | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
      > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
      | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
      | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
      | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
      | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
      | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
      | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
      | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
    > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
    | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
    | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
    | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
    | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
    | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
    | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
    | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
  > };

export type BoardsQueryVariables = Exact<{
  page: number;
}>;


export type BoardsQuery = { boards: Array<{ id: string, name: string, workspace_id: string | null, items_count: number | null, columns: Array<{ id: string, title: string, type: ColumnType, settings: unknown } | null> | null, groups: Array<{ id: string, title: string, position: string } | null> | null } | null> | null };

export type FirstPageQueryVariables = Exact<{
  board?: Array<string> | string | null | undefined;
  limit: number;
}>;


export type FirstPageQuery = { boards: Array<{ items_page: { cursor: string | null, items: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
                    | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
                    | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
                    | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
                    | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
                  > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
                  | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
                  | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
                > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
                | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
                | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
                | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
                | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
                | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
              > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
              | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
              | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
              | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
              | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
            > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
            | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
            | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
            | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
            | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
          > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
          | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
          | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
          | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
          | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
        > }> } } | null> | null };

export type NextPageQueryVariables = Exact<{
  cursor: string;
  limit: number;
}>;


export type NextPageQuery = { next_items_page: { cursor: string | null, items: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, subitems: Array<{ id: string, name: string, state: State | null, created_at: string | null, updated_at: string | null, creator_id: string, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
                  | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
                  | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
                  | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
                  | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
                > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
                | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
                | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
                | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
                | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
                | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
                | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
                | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
              > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
              | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
              | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
              | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
              | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
              | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
              | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
            > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
            | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
            | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
            | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
            | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
            | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
            | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
          > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
          | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
          | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
          | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
          | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
          | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
          | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
        > } | null> | null, group: { id: string } | null, parent_item: { id: string } | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null, column_values: Array<
        | { __typename: 'BatteryValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'BoardRelationValue', linked_item_ids: Array<string>, display_value: string, id: string, type: ColumnType, text: string | null }
        | { __typename: 'ButtonValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'CheckboxValue', checked: boolean | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'ColorPickerValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'CountryValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'CreationLogValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'DateValue', date: string | null, time: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'DependencyValue', linked_item_ids: Array<string>, id: string, type: ColumnType, text: string | null }
        | { __typename: 'DirectDocValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'DocValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'DropdownValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'EmailValue', email: string | null, label: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'FileValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'FormulaValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'GroupValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'HourValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'IntegrationValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'ItemIdValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LastUpdatedValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LinkValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LocationValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'LongTextValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'MirrorValue', display_value: string, id: string, type: ColumnType, text: string | null }
        | { __typename: 'NumbersValue', number: number | null, symbol: string | null, direction: NumberValueUnitDirection | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'PeopleValue', id: string, type: ColumnType, text: string | null, persons_and_teams: Array<{ id: string, kind: Kind | null }> | null }
        | { __typename: 'PersonValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'PhoneValue', phone: string | null, country_short_name: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'ProgressValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'RatingValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'StatusValue', label: string | null, index: number | null, is_done: boolean | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'SubtasksValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TagsValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TeamValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TextValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TimeTrackingValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'TimelineValue', from: string | null, to: string | null, visualization_type: string | null, id: string, type: ColumnType, text: string | null }
        | { __typename: 'UnsupportedValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'VoteValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'WeekValue', id: string, type: ColumnType, text: string | null }
        | { __typename: 'WorldClockValue', id: string, type: ColumnType, text: string | null }
      > }> } };

export type UpdatesQueryVariables = Exact<{
  ids?: Array<string> | string | null | undefined;
  page: number;
}>;


export type UpdatesQuery = { items: Array<{ id: string, updates: Array<{ id: string, body: string, text_body: string | null, created_at: string | null, creator_id: string | null, replies: Array<{ id: string, body: string, created_at: string | null, creator_id: string | null }> | null, assets: Array<{ id: string, name: string, file_extension: string, file_size: number } | null> | null }> | null } | null> | null };

export type AssetsQueryVariables = Exact<{
  ids: Array<string> | string;
}>;


export type AssetsQuery = { assets: Array<{ id: string, name: string, public_url: string } | null> | null };

export type UsersQueryVariables = Exact<{
  page: number;
}>;


export type UsersQuery = { users: Array<{ id: string, name: string, email: string, status: UserStatus, kind: string }> | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const ItemFieldsFragmentDoc = new TypedDocumentString(`
    fragment ItemFields on Item {
  id
  name
  state
  created_at
  updated_at
  creator_id
  group {
    id
  }
  parent_item {
    id
  }
  assets {
    id
    name
    file_extension
    file_size
  }
  column_values {
    __typename
    id
    type
    text
    ... on StatusValue {
      label
      index
      is_done
    }
    ... on PeopleValue {
      persons_and_teams {
        id
        kind
      }
    }
    ... on TimelineValue {
      from
      to
      visualization_type
    }
    ... on BoardRelationValue {
      linked_item_ids
      display_value
    }
    ... on DependencyValue {
      linked_item_ids
    }
    ... on MirrorValue {
      display_value
    }
    ... on DateValue {
      date
      time
    }
    ... on CheckboxValue {
      checked
    }
    ... on NumbersValue {
      number
      symbol
      direction
    }
    ... on EmailValue {
      email
      label
    }
    ... on PhoneValue {
      phone
      country_short_name
    }
  }
}
    `, {"fragmentName":"ItemFields"}) as unknown as TypedDocumentString<ItemFieldsFragment, unknown>;
export const ItemTreeFragmentDoc = new TypedDocumentString(`
    fragment ItemTree on Item {
  ...ItemFields
  subitems {
    ...ItemFields
    subitems {
      ...ItemFields
      subitems {
        ...ItemFields
        subitems {
          ...ItemFields
          subitems {
            ...ItemFields
          }
        }
      }
    }
  }
}
    fragment ItemFields on Item {
  id
  name
  state
  created_at
  updated_at
  creator_id
  group {
    id
  }
  parent_item {
    id
  }
  assets {
    id
    name
    file_extension
    file_size
  }
  column_values {
    __typename
    id
    type
    text
    ... on StatusValue {
      label
      index
      is_done
    }
    ... on PeopleValue {
      persons_and_teams {
        id
        kind
      }
    }
    ... on TimelineValue {
      from
      to
      visualization_type
    }
    ... on BoardRelationValue {
      linked_item_ids
      display_value
    }
    ... on DependencyValue {
      linked_item_ids
    }
    ... on MirrorValue {
      display_value
    }
    ... on DateValue {
      date
      time
    }
    ... on CheckboxValue {
      checked
    }
    ... on NumbersValue {
      number
      symbol
      direction
    }
    ... on EmailValue {
      email
      label
    }
    ... on PhoneValue {
      phone
      country_short_name
    }
  }
}`, {"fragmentName":"ItemTree"}) as unknown as TypedDocumentString<ItemTreeFragment, unknown>;
export const BoardsDocument = new TypedDocumentString(`
    query Boards($page: Int!) {
  boards(
    limit: 100
    page: $page
    state: active
    hierarchy_types: [classic, multi_level]
  ) {
    id
    name
    workspace_id
    items_count
    columns {
      id
      title
      type
      settings
    }
    groups {
      id
      title
      position
    }
  }
}
    `) as unknown as TypedDocumentString<BoardsQuery, BoardsQueryVariables>;
export const FirstPageDocument = new TypedDocumentString(`
    query FirstPage($board: [ID!], $limit: Int!) {
  boards(ids: $board) {
    items_page(limit: $limit) {
      cursor
      items {
        ...ItemTree
      }
    }
  }
}
    fragment ItemFields on Item {
  id
  name
  state
  created_at
  updated_at
  creator_id
  group {
    id
  }
  parent_item {
    id
  }
  assets {
    id
    name
    file_extension
    file_size
  }
  column_values {
    __typename
    id
    type
    text
    ... on StatusValue {
      label
      index
      is_done
    }
    ... on PeopleValue {
      persons_and_teams {
        id
        kind
      }
    }
    ... on TimelineValue {
      from
      to
      visualization_type
    }
    ... on BoardRelationValue {
      linked_item_ids
      display_value
    }
    ... on DependencyValue {
      linked_item_ids
    }
    ... on MirrorValue {
      display_value
    }
    ... on DateValue {
      date
      time
    }
    ... on CheckboxValue {
      checked
    }
    ... on NumbersValue {
      number
      symbol
      direction
    }
    ... on EmailValue {
      email
      label
    }
    ... on PhoneValue {
      phone
      country_short_name
    }
  }
}
fragment ItemTree on Item {
  ...ItemFields
  subitems {
    ...ItemFields
    subitems {
      ...ItemFields
      subitems {
        ...ItemFields
        subitems {
          ...ItemFields
          subitems {
            ...ItemFields
          }
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<FirstPageQuery, FirstPageQueryVariables>;
export const NextPageDocument = new TypedDocumentString(`
    query NextPage($cursor: String!, $limit: Int!) {
  next_items_page(cursor: $cursor, limit: $limit) {
    cursor
    items {
      ...ItemTree
    }
  }
}
    fragment ItemFields on Item {
  id
  name
  state
  created_at
  updated_at
  creator_id
  group {
    id
  }
  parent_item {
    id
  }
  assets {
    id
    name
    file_extension
    file_size
  }
  column_values {
    __typename
    id
    type
    text
    ... on StatusValue {
      label
      index
      is_done
    }
    ... on PeopleValue {
      persons_and_teams {
        id
        kind
      }
    }
    ... on TimelineValue {
      from
      to
      visualization_type
    }
    ... on BoardRelationValue {
      linked_item_ids
      display_value
    }
    ... on DependencyValue {
      linked_item_ids
    }
    ... on MirrorValue {
      display_value
    }
    ... on DateValue {
      date
      time
    }
    ... on CheckboxValue {
      checked
    }
    ... on NumbersValue {
      number
      symbol
      direction
    }
    ... on EmailValue {
      email
      label
    }
    ... on PhoneValue {
      phone
      country_short_name
    }
  }
}
fragment ItemTree on Item {
  ...ItemFields
  subitems {
    ...ItemFields
    subitems {
      ...ItemFields
      subitems {
        ...ItemFields
        subitems {
          ...ItemFields
          subitems {
            ...ItemFields
          }
        }
      }
    }
  }
}`) as unknown as TypedDocumentString<NextPageQuery, NextPageQueryVariables>;
export const UpdatesDocument = new TypedDocumentString(`
    query Updates($ids: [ID!], $page: Int!) {
  items(ids: $ids, limit: 100) {
    id
    updates(limit: 100, page: $page) {
      id
      body
      text_body
      created_at
      creator_id
      replies {
        id
        body
        created_at
        creator_id
      }
      assets {
        id
        name
        file_extension
        file_size
      }
    }
  }
}
    `) as unknown as TypedDocumentString<UpdatesQuery, UpdatesQueryVariables>;
export const AssetsDocument = new TypedDocumentString(`
    query Assets($ids: [ID!]!) {
  assets(ids: $ids) {
    id
    name
    public_url
  }
}
    `) as unknown as TypedDocumentString<AssetsQuery, AssetsQueryVariables>;
export const UsersDocument = new TypedDocumentString(`
    query Users($page: Int!) {
  users(limit: 1000, page: $page) {
    id
    name
    email
    status
    kind
  }
}
    `) as unknown as TypedDocumentString<UsersQuery, UsersQueryVariables>;