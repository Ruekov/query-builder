import {ISelectItem} from "./select-item.interface";
import {QueryKind} from "./query-type.enum";

export default class Sql {

    private _queryKind: QueryKind;
    private _selects: Array<ISelectItem>;
    private _tables: Array<string>;
    private _wheres: Array<string>;
    private _whereConcat: string;
    private _whereConcatDefault: string;
    private _sets: Array<any>;
    private _limit: number;
    private _offset: number;
    private _orderBys: Array<any>;
    private _joins: Array<any>;
    private _groupBys: Array<string>;
    private _whereGroupCount: number;
    private _openWhereGroupCount: number;
    private _havings: Array<any>;

    constructor() {
        this.reset();
    }

    private reset() {
        this._queryKind = undefined;
        this._selects = [];
        this._tables = [];
        this._wheres = [];
        this._whereConcat = "and";
        this._whereConcatDefault = "and";
        this._sets = [];
        this._limit = undefined;
        this._offset = undefined;
        this._orderBys = [];
        this._joins = [];
        this._groupBys = [];
        this._whereGroupCount = 0;
        this._openWhereGroupCount = 0;
        this._havings = [];
        return this;
    }

    select();
    select(field: string);
    select(func: string, field: any, alias: string);
    select(field?: any, alias?: string, func?: string) {
        this._queryKind = QueryKind.SELECT;
        switch (arguments.length) {
            case 0:
                this._selects.push({ "field": "*" });
                break;
            case 1:
                if (!Array.isArray(field)) field = String(field).split(",");
                (field as Array<string>).map(f => f.trim()).filter(Boolean).forEach(f => {
                    var [field, alias] = f.split(/\s*as\s*/i);
                    this._selects.push({ field, alias });
                });
                break;
            case 2:
                if (this._isString(field)) {
                    this._selects.push({ field, alias });
                }
                break;
            default:
                var args: Array<any> = Array.prototype.slice.call(arguments);
                func = args.shift(); // First parameter
                alias = args.pop(); // Last parameter
                args = args.map(f => Array.isArray(f) ? f.join(", ") : f); // Do flatten array.
                this._selects.push({ func, alias, "field": args.join(", ") });
        }
        return this;
    }
    

    between(field, value, otherValue) {
        if (otherValue === undefined) {
            var split = value.split("..");
            if (split.length > 1) {
                [value, otherValue] = split;
            }
        }
        var sql = field + " between " + this._wrap(value) + " and " + this._wrap(otherValue);
        this._where(sql);
        return this;
    }

    table(table: Array<string>);
    table(table: string);
    table(table: any) {
        if (!Array.isArray(table)) {
            table = [table];
        }
        table.forEach(t => this._tables.push(t));
        return this;
    }

    from(table: Array<string>);
    from(table: string);
    from(table: any) {
        return this.table(table);
    }

    into(table: string);
    into(table: Array<string>);
    into(table: any) {
        return this.table(table);
    }

    private static _operators = [">=", "<=", "!=", "<>", ">", "<", "!@", "@", "%$", "^%", "%", "like", "not like", "is", "is null", "is not null"];


    private _isString(str){
        if (str != null && typeof str.valueOf() === "string") {
          return true
        }
        return false
      }

    private _conditionExpr(field: string, value?: any, operator?: string) {
        var wrapValue = true;
        if (!operator) {
            operator = Sql._operators.find(o => field.endsWith(o));
            if (operator) {
                field = field.slice(0, -operator.length).trim();
            }
        }
        switch (operator) {
            case "is null":
                operator = "is";
                value = "@null";
                break;
            case "is not null":
                operator = "is not";
                value = "@null";
                break;
            default:
                if (!operator) {
                    operator = "=";
                }
        }
        if (value === null) {
            value = "@null";
        }
        if (this._isString(value) && value.substr(0, 1) === "@") {
            wrapValue = false;
            value = value.substr(1);
        }
        if (wrapValue && value !== undefined) {
            value = this._wrap(value);
        }
        return { field, operator, value };
    }

    where(field, operator?, value?) {
        if (typeof field === "object") {
            for (var i in field) {
                this.where(i, field[i]);
            }
            return this;
        }
        if (value === undefined) {
            value = operator;
            operator = undefined;
        }
        var expr = this._conditionExpr(field, value, operator);
        switch (expr.operator) {
            case "@": return this.whereIn(field.slice(0, -1), value);
            case "!@": return this.whereNotIn(field.slice(0, -2), value);
            case "!%": return this.notLike(field.slice(0, -2), value, "both");
            case "%": return this.like(field.slice(0, -1), value, "both");
            case "^%": return this.like(field.slice(0, -2), value, "right");
            case "%$": return this.like(field.slice(0, -2), value, "left");
        }
        this._where(`${expr.field} ${expr.operator} ${expr.value}`);
        return this;
    }

    whereNotIn(field, values) {
        return this.whereIn(field, values, "not in");
    }

    whereIn(field, values: Array<string>, op = "in") {
        if (!Array.isArray(values)) values = [String(values)];
        values = values.map(this._wrap);
        var value = "(" + values.join(",") + ")";
        var where = field + " " + op + " " + value;
        this._where(where);
        return this;
    }

    limit(limit: number, offset?: number) {
        this._limit = limit;
        if (offset !== undefined) {
            this._offset = offset;
        }
        return this;
    }

    top(n: number) {
        return this.limit(n);
    }

    offset(offset: number) {
        this._offset = offset;
        return this;
    }

    skip(n: number) {
        return this.offset(n);
    }

    notLike(field, match, side) {
        return this.like(field, match, side, "not like");
    }

    like(field: string, match = "", side = "both", op = "like") {
        field = field.trim();
        switch (side) {
            case "left": match = "%" + match; break;
            case "right": match += "%"; break;
            case "both": {
                if (this._isString(match) && match.length === 0) {
                    match = "%";
                } else {
                    match = "%" + match + "%";
                }
            } break;
            default:
                throw new Error(`Unknown side ${side}`);
        }
        this._where(`${field} ${op} ${this._wrap(match)}`);
        return this;
    }

    groupBy(fields: Array<string>) {
        if (!Array.isArray(fields)) {
            fields = String(fields).split(",");
        }
        fields
            .map(f => f.trim())
            .filter(f => f.length > 0)
            .forEach(f => {
                this._groupBys.push(f);
            });
        return this;
    }

    andOp() {
        this._whereConcat = "and";
        return this;
    }

    orOp() {
        this._whereConcat = "or";
        return this;
    }

    beginWhereGroup() {
        this._whereGroupCount++;
        this._openWhereGroupCount++;
        return this;
    }

    endWhereGroup() {
        if (this._whereGroupCount > 0) {
            var whereCount = this._wheres.length;
            if (this._openWhereGroupCount >= this._whereGroupCount) {
                this._openWhereGroupCount--;
            } else if (whereCount > 0) {
                this._wheres[whereCount - 1] += ")";
            }
            this._whereGroupCount--;
        }
        return this;
    }

    private _endQuery() {
        while (this._whereGroupCount > 0) {
            this.endWhereGroup();
        }
    }

    private static _joinTypes = ["inner", "outer", "left", "right", "left outer", "right outer"];

    join(table: string, on: string, join: string) {
        if (!Sql._joinTypes.includes(join)) join = "";
        var expr = `${join} join ${table} on ${on}`.trim();
        this._joins.push(expr);
        return this;
    }

    leftJoin(table: string, on: string) {
        return this.join(table, on, "left");
    }

    having(field, value) {
        var expr = this._conditionExpr(field, value);
        this._havings.push(`${expr.field} ${expr.operator} ${expr.value}`);
        return this;
    }

    orderBy(field, direction: string = "asc") {
        direction = direction.toLowerCase();
        if (direction !== "asc") direction = "desc";
        var expr = `${field} ${direction}`;
        this._orderBys.push(expr);
        return this;
    }

    get() {
        switch (this._queryKind) {
            case QueryKind.SELECT: return this.getSelect();
            case QueryKind.DELETE: return this.getDelete();
            case QueryKind.INSERT: return this.getInsert();
            case QueryKind.UPDATE: return this.getUpdate();
            default:
                throw new TypeError(`Unknown kind of query ${this._queryKind}`);
        }
    }

    getSelect() {
        this._endQuery();
        var sql = "select ";
        var selects = this._selects
            .map(item => {
                var field = item.field;
                if (item.func) field = item.func + "(" + field + ")";
                if (item.alias) field = field + " as " + item.alias;
                return field;
            })
            .join(", ");
        if (selects === "") selects = "*";
        sql += selects;
        if (this._tables.length > 0) sql += " " + "from " + this._tables.join(", ");
        if (this._joins.length > 0) sql += " " + this._joins.join(" ");
        if (this._wheres.length > 0) sql += " " + "where " + this._wheres.join(" ");
        if (this._groupBys.length > 0) sql += " " + "group by " + this._groupBys.join(", ");
        if (this._havings.length > 0) sql += " " + "having " + this._havings.join(" ");
        if (this._orderBys.length > 0) sql += " " + "order by " + this._orderBys.join(", ");
        if (!isNaN(this._limit)) {
            sql += " ";
            sql = this.getLimit(sql, this._limit, this._offset);
        }
        this.reset();
        return sql;
    }

    delete(table?: string) {
        this._queryKind = QueryKind.DELETE;
        if (table) {
            this._tables.push(table);
        }
        return this;
    }

    getDelete() {
        var table = this._tables[0];
        var result = "delete " + table;
        if (this._wheres.length > 0) {
            result += " " + "where " + this._wheres.join(" ");
        }
        this.reset();
        return result;
    }

    update(table?: string) {
        this._queryKind = QueryKind.UPDATE;
        if (table) {
            this._tables.push(table);
        }
        return this;
    }

    getUpdate() {
        this._endQuery();
        var table = this._tables[0];
        var result = "update " + table + " set ";
        result += this._sets
            .map(item => {
                var value = item.value;
                if (item.wrapValue) value = this._wrap(value);
                return `${item.name} = ${value}`;
            })
            .join(", ");
        if (this._wheres.length > 0) {
            result += " where " + this._wheres.join(" ");
        }
        this.reset();
        return result;
    }

    insert() {
        this._queryKind = QueryKind.INSERT;
        return this;
    }

    set(name, value, wrapValue: boolean = true) {
        if (arguments.length === 1) {
            for (var i in name) {
                this.set(i, name[i], true);
            }
            return this;
        }
        if (value === null || value === undefined) {
            value = "null";
            wrapValue = false;
        }
        this._sets.push({
            name: name,
            value: value,
            wrapValue: wrapValue
        });
        return this;
    }

    getInsert() {
        var table = this._tables[0];
        var result = "insert into " + table;
        var names = this._sets.map(item => item.name);
        var values = this._sets.map(item => {
            var value = item.value;
            if (item.wrapValue) value = this._wrap(value);
            return value;
        });
        result += "(" + names.join(", ") + ") values(" + values.join(", ") + ")";
        this.reset();
        return result;
    }

    getLimit(sql, limit, offset): string {
        throw new Error("getLimit() not supported.");
    }

    private _where(sql: string) {
        var concat = "";
        if (this._wheres.length > 0) {
            concat = this._whereConcat + " ";
        }
        while (this._openWhereGroupCount > 0) {
            concat += "(";
            this._openWhereGroupCount--;
        }
        this._whereConcat = this._whereConcatDefault;
        this._wheres.push(concat + sql);
    }

    private _wrap(value: any) {
        if (isNaN(value)) {
            value = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                .replace(/'/g, "\\'")
                .replace(/\\"/g, '"') + '\'';
        }
        return value;
    }

    private _quote(value: string, wrapInQuotes: boolean) {
        if (isNaN(parseInt(value))) {
            return value;
        }
        value = value
            .replace("\\", "\\\\")
            .replace("\0", "\\0")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\x1a", "\\Z");
        if (wrapInQuotes) {
            value = "'" + value + "'";
        }
        return value;
    }
}
